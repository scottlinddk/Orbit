# Calendars

Orbit shows the events of calendars you can share as an **ICS link** (also called "secret address in iCal format" or a `webcal://` link). It only reads them. CalDAV and Google sign-in are not supported; see [ADR 0003](../architecture/adr/0003-calendar-integrations.md) for why.

## Before you start

Saving a calendar needs the server's master key, because the link is a credential and Orbit stores it encrypted. Set `ORBIT_SECRET_KEY` (at least 32 characters, `openssl rand -base64 32`) and restart. Without it, adding a calendar fails with a message that says so. Set `ORBIT_TIME_ZONE` (for example `Europe/Copenhagen`) if you use the [TRMNL feed](trmnl-feed.md), so "today" means your today.

## Add a calendar

1. In your calendar app, find the private ICS link:
   - **Nextcloud:** calendar menu, _Copy private link_. Nextcloud serves the ICS file when the link ends in `?export`.
   - **Fastmail:** the calendar's sharing options offer an iCalendar (ICS) link.
   - **iCloud:** share the calendar as _Public Calendar_ and copy the link. This makes it readable by anyone who has the link.
   - **Google:** _Settings and sharing, Integrate calendar, Secret address in iCal format_.
2. As an owner, open the household page, then **Calendars**. Give it a name, paste the link, pick a color, and choose **Add calendar**.
3. Orbit reads the link once to check it. If that fails you get the reason (for example "status 404") and nothing is saved.
4. Add an **Agenda** or **Today** widget to a dashboard.

A household can have up to ten calendars. Members can see the events and the list of calendars (name and host), but not change them.

## The link is a secret

Anyone with an ICS link can read that calendar. Orbit therefore:

- stores the link encrypted ([`ORBIT_SECRET_KEY`](deployment.md)) and keeps only the host name in the database, so a copy of the database alone does not reveal it;
- never returns it from the API and never writes it to the log, and error messages never include it;
- cannot show it again. To change a link, remove the calendar and add it again.

If a link leaks, make a new one in your calendar app (which invalidates the old one) and replace the calendar here.

## How it behaves

- Orbit reads each calendar at most every **five minutes**, for a window from 7 days ago to 62 days ahead, and answers every request from that.
- Recurring events are expanded, including exceptions and cancellations, in the calendar's own time zone. An event at 09:00 Copenhagen time stays at 09:00 across the daylight saving change, and its UTC instant moves by an hour.
- If a calendar cannot be read, the widgets keep showing its **last good events** and say which calendar could not be refreshed. Errors are explained without naming the address.
- Feeds are fetched through Orbit's [egress guard](../architecture/adr/0003-calendar-integrations.md#egress-guard-implemented): private and local addresses are refused, with a size limit of 5 MB and a time limit of 15 seconds. To read a calendar on your own network (a NAS, say) list its host in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`.

## API

`GET /api/v1/households/{id}/calendar/events?from=2026-01-05&to=2026-01-12` returns the merged events of all calendars, plus the status of each calendar. Without `from` and `to` it returns the next week. See the [OpenAPI document](../../apps/api/openapi.json). Calendars are managed under `/calendar/sources`.
