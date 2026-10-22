# Notifications and reminders

Orbit can send reminders and list news to a **webhook you run**: Home Assistant, ntfy, n8n, a chat bridge, or a small script. Orbit POSTs a signed JSON message. What happens next (a phone notification, a chat message, a light turning on) is up to the receiver. Design notes are in [ADR 0020](../architecture/adr/0020-notifications.md).

Only owners can set this up. Open the household page and use **Notifications**.

## What you can be told about

| Event                     | When                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `calendar.event.starting` | A timed calendar event starts in N minutes (you choose N, default 15) |
| `list.item.added`         | Someone adds an item to a list                                        |
| `list.item.completed`     | Someone ticks an item off a list                                      |

Calendar reminders need a calendar ([calendars](calendar.md)). All-day events get no reminder, because they have no start time. An event is announced once per endpoint, also if Orbit restarts. Changing the minutes of an endpoint can announce an upcoming event again.

## Set it up

1. The server needs `ORBIT_SECRET_KEY` (the webhook address is stored encrypted, as calendar addresses are). Without it, adding a webhook answers 409 and names the setting.
2. On the household page, under **Notifications**, enter a name, the webhook address and the events you want. Orbit does not call the address when you add it.
3. **Copy the signing secret now.** It is shown once and cannot be shown again. If you lose it, remove the webhook and add it again.
4. Press **Send test**. The result says whether the receiver answered, and the log shows the last 20 attempts with status codes (never the message or the address).

A server on your home network (Home Assistant on `192.168.x.x`, for example) is refused unless the administrator allows that exact host: set `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS=homeassistant.local` (comma separated, host names only, no port) and restart. This is on purpose: a webhook address typed by an owner must not be able to probe the household network.

## The message

```http
POST /your/webhook HTTP/1.1
Content-Type: application/json
User-Agent: Orbit-Notifications/1
X-Orbit-Event: list.item.added
X-Orbit-Delivery: 5d0c1b2e-...
X-Orbit-Timestamp: 1767225600
X-Orbit-Signature: sha256=97e2748109c856cbd141554be54c764ddaf1804df3c0d16fa910e37fa64532e7

{"version":1,"id":"5d0c1b2e-...","event":"list.item.added","occurredAt":"2026-01-01T00:00:00.000Z","data":{"listId":"...","listName":"Groceries","itemId":"...","text":"Milk","quantity":"2 l"}}
```

`data` per event:

- `calendar.event.starting`: `title`, `start` and `end` (UTC, ISO 8601), `minutesBefore`.
- `list.item.added`: `listId`, `listName`, `itemId`, `text`, and `quantity` if there is one.
- `list.item.completed`: `listId`, `listName`, `itemId`, `text`.
- `notification.test`: `message`.

Notes are never sent. A message is at most 8 KB.

## Check the signature

The signature is a lowercase hex HMAC-SHA256, keyed with your signing secret, over the timestamp, a dot and the **raw request body** exactly as received:

```
hex( HMAC_SHA256( secret, "<X-Orbit-Timestamp>.<raw body>" ) )
```

A receiver should:

1. Read the raw body before parsing it.
2. Compute the HMAC and compare it to the hex after `sha256=` **in constant time**.
3. Refuse a request whose `X-Orbit-Timestamp` is more than about five minutes from its own clock. The timestamp is signed, so an old request cannot be replayed with a new one.
4. Remember `X-Orbit-Delivery` for a while and ignore a repeat. Retries of one delivery share the id.

Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verify(secret, headers, rawBody, now = Date.now()) {
  const timestamp = Number(headers['x-orbit-timestamp'])
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
  const received = String(headers['x-orbit-signature'] ?? '').replace(/^sha256=/, '')
  return (
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
}
```

Python:

```python
import hashlib, hmac, time

def verify(secret: str, headers: dict, raw_body: bytes, now: float | None = None) -> bool:
    now = time.time() if now is None else now
    timestamp = headers.get("x-orbit-timestamp", "")
    if not timestamp.isdigit() or abs(now - int(timestamp)) > 300:
        return False
    signed = timestamp.encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    received = headers.get("x-orbit-signature", "").removeprefix("sha256=")
    return hmac.compare_digest(received, expected)
```

The signature proves the message came from this Orbit and was not changed. It does not hide the content. Use `https` for a receiver outside your home network.

## Delivery, retries and switching off

- A reply with a 2xx status counts as delivered. Orbit waits up to 10 seconds.
- A timeout, a network or DNS error, 408, 429 and any 5xx are retried, up to 5 tries in all, after 30 seconds, 2 minutes, 8 minutes and 32 minutes. Any other reply (including 3xx) is a final failure and is not retried. Orbit never follows a redirect on a POST.
- After **10 failed deliveries in a row** the webhook is switched off and the panel shows why. A delivery that arrives resets the count. Switch it back on after fixing the receiver.
- At most 60 messages per webhook per minute are sent. The rest are dropped, and the log says `dropped`.
- Messages are queued in the database, so a restart does not lose them.

## Troubleshooting

| What you see in the log                                | Likely cause                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `That address is not allowed.`                         | The host resolves to a private address. Allow it with `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` if you trust it.         |
| `The server answered with a redirect.`                 | The address redirects (often `http` to `https`). Use the final address.                                           |
| `The request took too long.`                           | The receiver needs more than 10 seconds. Answer first and work afterwards.                                        |
| `The server answered 401` or `403`                     | The receiver wants a token that is not in the address. Put it in the address, since Orbit sends no extra headers. |
| Nothing arrives for calendar events                    | The calendar cache is cold after a restart (it fills within a few minutes), or the event is all-day.              |
| `Switched off after 10 failed deliveries in a row ...` | Fix the receiver, then switch the webhook on again.                                                               |

## Not included

Web push to browsers, email, SMS, quiet hours and digests are not built. The reasons for web push, and the checklist for adding it, are in [ADR 0020](../architecture/adr/0020-notifications.md#web-push-not-in-this-change).
