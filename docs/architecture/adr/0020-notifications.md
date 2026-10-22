# 0020 Notifications and reminders

Status: accepted

## Context

Planners send reminders and news (issue 22). Orbit now has the data for it: calendars ([ADR 0003](0003-calendar-integrations.md)) and shared lists. Households that self-host already run something that turns an HTTP call into a phone message, such as Home Assistant, ntfy or n8n. The question is how Orbit tells them, without becoming a push service of its own and without opening a new way to reach the household's network.

## Decisions

1. **Outgoing webhooks first.** An owner registers an endpoint: a name, an address, the events it wants, and (for calendar reminders) how many minutes before an event to send. Up to ten per household. Orbit POSTs a JSON message to it. Everything that turns the message into a phone notification stays in the receiver's hands.
2. **Events.** `calendar.event.starting`, `list.item.added`, `list.item.completed`. A new event is added to one list in the domain (`NOTIFICATION_EVENTS`), and an endpoint only receives the events it chose. `notification.test` is sent by the owner's test button and nothing else.
3. **The address is a credential.** Chat webhooks carry their token in the path, so the address is kept in the `SecretStore` (encrypted, needs `ORBIT_SECRET_KEY`) and only its host is stored, shown and logged, as with calendar feeds. A server without the key refuses to add an endpoint with a clear message (409).
4. **Every message is signed.** Orbit generates a 256-bit signing secret per endpoint and shows it once, in the response that creates the endpoint. It is kept in the `SecretStore` and never returned again. Each request carries:
   - `X-Orbit-Timestamp`: Unix seconds at the time of this attempt.
   - `X-Orbit-Signature: sha256=<hex>`: HMAC-SHA256 over `<timestamp>.<raw body>`, keyed with the secret.
   - `X-Orbit-Event` and `X-Orbit-Delivery`. The delivery id is the same on every retry, so a receiver can ignore repeats.

   The timestamp is part of what is signed, so a captured request cannot be replayed with a fresh timestamp. A receiver should also refuse a timestamp more than a few minutes old. The signature does not hide the content: use `https` for a receiver outside the household.

5. **The body** is a versioned envelope: `{ "version": 1, "id", "event", "occurredAt", "data" }`. Data holds what the event is about and nothing else (a title and times, or a list name and an item's text and quantity, never notes or ids of people). The body is capped at 8 KB. A message that would exceed it is not sent and says so in the log.
6. **Delivery goes through the shared egress guard** ([ADR 0003](0003-calendar-integrations.md)). A webhook address cannot reach loopback, link-local, cloud metadata or LAN addresses unless the administrator allows that host in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, per host. A `POST` is never redirected, because a redirect would resend the message to a place nobody chose. Replies are capped at 256 KB and requests time out after 10 seconds. A refused address fails at once and is not retried.
7. **Queue and retries.** A message is a durable job in the existing `JobScheduler` (the SQLite table, so it survives a restart), under the id prefix `notify:`. Planets and notifications share the table, so claiming now takes an optional prefix and each side takes only its own jobs (before this, Planets would have claimed and discarded notification jobs). A delivery is tried up to 5 times with pauses of 30 s, 2 min, 8 min and 32 min. A 2xx reply ends it. These are retried: timeouts, network errors, DNS failures, 408, 429 and 5xx. These are not: other 4xx, refused addresses, redirects and oversized replies.
8. **Failure handling is visible.** Each attempt is written to a delivery log kept per endpoint (the last 20, newest first): time, event, attempt, outcome, HTTP status and a short error. It never holds the message, the address or where a name resolved to. A delivery that gives up counts as one failure; a delivery that arrives resets the count. After 10 failed deliveries in a row Orbit switches the endpoint off and shows the reason. An owner can switch it back on, which clears the count. The test button tries once, works on a switched-off endpoint, and never counts toward switching it off.
9. **Rate limit.** At most 60 messages per endpoint per minute (in memory, it protects the receiver, not Orbit). The rest are dropped and logged as `dropped`. Raising the limit is a code change, not a setting, until someone needs it.
10. **Calendar reminders are scanned, not scheduled per event.** Every 30 seconds the API process looks at the calendar cache for each household that has an endpoint wanting `calendar.event.starting`, and sends a reminder for each timed event that starts within the endpoint's lead time. All-day events and events that already started get none. Each (endpoint, occurrence, start time, lead time) is recorded in a `notification_dedupe` table before sending, so a reminder is sent once, also across a restart. Records are forgotten a day after the event starts. The scan reads only the calendar service's cache: it never makes the calendar server be asked more often than the 5-minute TTL allows, and a cache that is still cold after a restart simply means the reminder goes out on a later scan. Changing an endpoint's lead time can announce an event again.
11. **Permissions.** A new action, `notification:manage`, owner only. Members, children and devices cannot list, add, change, test or read the log of an endpoint, because the list shows where household news goes. List and calendar events are published by the use cases that change them, whoever made the change.
12. **Publishing never blocks or fails the user's action.** Use cases tell a sink that something happened. The sink queues jobs in the background and swallows its own errors, so ticking off a milk item does not wait for or fail because of a webhook.

## Web push: not in this change

Web push (the browser's own push service, with VAPID keys and per-device subscriptions) was considered for the same events and **deferred**:

- It needs RFC 8291 payload encryption and RFC 8292 VAPID signing. Both can be done with `node:crypto` and there is a test vector in the RFC, but the three push services (Google, Mozilla, Apple) differ in what they enforce, and none of them can be tried from where this was built. Shipping encryption that passes its own tests but that no push service has accepted would be a feature that looks finished and is not.
- It only works for members who installed the PWA, over HTTPS ([ADR 0012](0012-docker-deployment.md)), and needs a per-user subscription store with cleanup of expired subscriptions.
- A third party (the browser vendor's push service) would carry a message about the household for every member. The webhook path lets a household keep this inside its own network.
- Webhooks already reach phones through ntfy, Home Assistant or a chat bridge.

Follow-up checklist, if wanted: generate and store VAPID keys in the `SecretStore` on first use; a `push_subscriptions` table per user and device; routes to subscribe and unsubscribe (any role that may see the data); delivery through the egress guard with TTL and urgency headers; remove a subscription on 404 or 410; a `push` handler in `apps/web/src/pwa/sw.js` that never caches API data; a per-user opt-in toggle; and a test against each push service by hand before it is called supported.

## Consequences

- Three new tables (`notification_endpoints`, `notification_deliveries`, `notification_dedupe`) and three ports. The domain and application layers stay free of `node:crypto` and `URL`: signing and address parsing sit behind a `NotificationPlatform` port implemented in `apps/api`.
- `JobScheduler.claimDue` gained an optional prefix. Existing callers are unchanged except Planets, which now claims only `planet:` jobs.
- New protected operations under `/households/{id}/notifications/endpoints`, all owner only and all in the isolation suites. The threat model has rows for them in [the security model](../security-model.md).
- A new timer in the API process (every 30 seconds) runs the scan and the queue.
- Not covered: email, SMS, per-member subscriptions, quiet hours, digests, and custom message templates. Each would need its own decision.
