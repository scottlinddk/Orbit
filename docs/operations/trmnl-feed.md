# TRMNL display feed

Orbit can publish a read-only feed that a [TRMNL](https://trmnl.com) e-ink display polls. You create the feed in Orbit, then paste its address and token into a private plugin you own on TRMNL. TRMNL turns the data into the screen. Orbit does not pair with the device and does not render images ([ADR 0016](../architecture/adr/0016-trmnl-display-feed.md)).

## Before you start

- **Public HTTPS is required.** TRMNL's cloud fetches the feed, so your Orbit must be reachable from the internet over HTTPS. Use the [Caddy override](deployment.md#https-with-caddy). A LAN-only or Tailscale-only install cannot use the feed.
- **Your data passes through TRMNL's cloud.** TRMNL fetches the feed, stores it, and renders it. Publish only what you are happy to share with them. Orbit lets you choose each field.
- **The token is a password for one feed.** Anyone who has it can read that feed, nothing else. You can revoke it at any time.

## What a feed contains

You choose the fields. Nothing else is published, and widget settings are never included.

| Field               | Published as                                              |
| ------------------- | --------------------------------------------------------- |
| `household.name`    | `household.name`                                          |
| `dashboard.name`    | `dashboard.name` (needs a dashboard)                      |
| `dashboard.widgets` | `dashboard.widgets[]` with `type` and `span` per item     |
| `calendar.today`    | `calendar.today[]`: events that touch today               |
| `calendar.upcoming` | `calendar.upcoming[]`: events starting in the next 7 days |

Calendar fields need at least one [calendar](calendar.md). Each list holds at most 20 events, with `title`, `allDay`, `start` and `end` and nothing else (no location, no calendar name). Timed events use ISO instants in UTC; all-day events use dates, with an exclusive `end`. "Today" follows `ORBIT_TIME_ZONE` (default `UTC`, so set it to your own zone). The feed never waits for a calendar server: it answers from the last events Orbit read and refreshes them in the background, so the first poll after a restart can be empty and the next one has data. More fields (list items) are added when those data sources are stored on the server. A feed is capped at 64 KB. TRMNL requires the combined data of a plugin to stay under 100 KB.

## Create a feed

Only household owners can manage feeds. There is no screen for it yet, so use the API with a signed-in session. This example uses the browser's developer console while signed in to Orbit:

```js
const res = await fetch('/api/v1/households/<household-id>/feeds', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Kitchen display',
    fields: ['household.name', 'dashboard.name', 'dashboard.widgets'],
    dashboardId: '<dashboard-id>',
  }),
})
console.log(await res.json()) // copy "token" now
```

The token appears once, in this response. Orbit keeps only a hash and cannot show it again. If you lose it, revoke the feed and create a new one.

List feeds with `GET /api/v1/households/<household-id>/feeds`. Revoke one with `DELETE /api/v1/households/<household-id>/feeds/<feed-id>`. A revoked token stops working at once.

## Set up the TRMNL plugin

In TRMNL, create a **Private Plugin** and choose the **Polling** strategy.

| Setting     | Value                                                             |
| ----------- | ----------------------------------------------------------------- |
| Polling URL | `https://orbit.example.com/api/v1/feed`                           |
| Verb        | `GET`                                                             |
| Headers     | `Authorization: Bearer <your token>` (one `Name: Value` per line) |

Limits that come from TRMNL (checked against its help center on 2026-10-22; they can change):

- TRMNL polls every 15 minutes at the fastest, or every 5 minutes with TRMNL+.
- TRMNL waits 10 seconds for an answer and retries once. Orbit answers from stored data, so it is fast.
- The combined data must stay under 100 KB.

Orbit sends an `ETag`. Repeated polls with `If-None-Match` get `304` while nothing changed.

### Sample markup

Paste this into the plugin's Markup editor. The polled JSON is available as top-level variables.

```liquid
<div class="layout">
  <div class="columns">
    <div class="column">
      <span class="title">{{ household.name }}</span>
      <span class="label">{{ dashboard.name }}</span>
      {% for widget in dashboard.widgets %}
        <div class="item"><span class="label">{{ widget.type }}</span></div>
      {% endfor %}
    </div>
  </div>
</div>
```

If the dashboard was deleted, `dashboard` is `null` and the loop renders nothing.

A calendar feed (`calendar.today` and `calendar.upcoming`) renders like this. Times are in UTC in the feed, so give them to Liquid's `date` filter with your zone:

```liquid
{% for event in calendar.today %}
  <div class="item">
    <span class="label">{% if event.allDay %}All day{% else %}{{ event.start | date: "%H:%M" }}{% endif %}</span>
    <span class="title title--small">{{ event.title }}</span>
  </div>
{% endfor %}
```

## What the endpoint does

`GET /api/v1/feed` with `Authorization: Bearer <token>`.

- A missing, malformed, unknown or revoked token all get the same `404`. A token never appears in a URL.
- The endpoint is rate limited per token and per client address. Repeated bad tokens from one address get `429`.
- If a feed grows past 64 KB it answers `413` rather than a cut-off body.

## Troubleshooting

- **404 from TRMNL's preview.** The token is wrong or revoked. Check the header line has no extra spaces.
- **429.** The plugin is polling too often, or something is guessing tokens from the same address. Wait a minute.
- **The plugin cannot connect.** Check that `https://<your address>/api/v1/health` works from outside your network.
