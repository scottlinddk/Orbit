# Home Assistant

Orbit can show calendars and to-do lists from Home Assistant next to its own. Orbit only reads them. Changing a mirrored list or event happens in Home Assistant. Design notes are in [ADR 0019](../architecture/adr/0019-connections-and-home-assistant.md).

Status: the adapter is tested against an in-process fake Home Assistant that follows the response shapes in Home Assistant's source (checked on 2026-10-22, release 2026.10). It has not been run against a real instance by the maintainers. The checklist at the bottom is open: do it once and report the result.

## What you need

1. **`ORBIT_SECRET_KEY`** set on the server (at least 32 characters). The address and the token are stored encrypted, and Orbit refuses to save them without it. Generate one with `openssl rand -base64 32`.
2. **Home Assistant's address** as you open it in a browser, for example `http://homeassistant.local:8123`, or `https://home.example.com`. A path prefix is kept (a reverse proxy under `/ha`), a trailing slash is dropped.
3. **A long-lived access token.** In Home Assistant open your profile (bottom left), then **Security**, then **Create token** under long-lived access tokens, and copy it at once: Home Assistant shows it only once. The token has the same reach as your Home Assistant user, so use a user that may only read what you want to show. Give it a name such as `Orbit`.
4. **Permission to reach a private address.** Home Assistant usually sits on your home network, and Orbit refuses private addresses by default so a typed-in address cannot be used to probe your network. Whoever runs the server lists the host name, exactly as you will type it, in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, then restarts Orbit:

   ```sh
   ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS=homeassistant.local
   ```

   Several hosts are separated by commas. This is per host, not for the whole network. If you skip this step, adding the connection fails with a message that names this setting.

## Connect

1. Sign in as an owner and open the household page, **Connections**.
2. Enter a name, the address and the token, then **Add connection**. Orbit calls Home Assistant once to check them, and saves nothing if that fails. Neither the address nor the token is shown again: the page lists only the name and host.
3. **Choose** the calendars and lists to show, then **Save**. The choice is the whole set: anything not ticked stops being shown.

Calendars appear in the agenda and today widgets, mixed with Orbit's own calendars. Lists appear in the shopping list widget's list choice, marked as kept in another system: items cannot be ticked or added there.

**Test** checks that Home Assistant still answers. **Remove** forgets the connection and its token and removes the mirrored calendars and lists from the household.

## What is mirrored

| Home Assistant        | Orbit                                                                                |
| --------------------- | ------------------------------------------------------------------------------------ |
| `calendar.*` entities | Events, from 7 days ago to 62 days ahead, with all-day events, recurrence and places |
| `todo.*` entities     | Lists with items: title, done or not, description as a note. Due dates are not shown |
| Everything else       | Not read                                                                             |

## Limits and behaviour

- Calendars are read at most every five minutes, lists every minute. If Home Assistant stops answering, Orbit keeps showing the last good copy and says so (a source marked as failing in the agenda, "Not up to date" on a list).
- At most 5 connections per household, 20 mirrors per connection, 2000 events per calendar and 1000 items per list.
- Reading `GET /api/states` returns every entity of your installation, so Orbit allows up to 8 MB for that one answer, and only when an owner adds a connection, tests it or opens **Choose**.
- Orbit does not write to Home Assistant, does not use its WebSocket API, and does not follow changes as they happen.
- A display feed ([TRMNL feed](trmnl-feed.md)) uses what is cached and never waits for Home Assistant.
- Home Assistant does not promise that these REST responses stay the same. After a Home Assistant upgrade, use **Test**; if something stops working, open an issue with your Home Assistant version.

## Security

- The token and address are in the encrypted secret store, scope `connection:<id>`. They are not in any API response, log line, error message or the OpenAPI document (tests: `apps/api/src/connections.http.test.ts`, `packages/testing/src/connections.test.ts`).
- Only owners can add, test, change or remove a connection. Other members see the mirrored data, not the connection.
- Requests go through the shared egress guard, stay on the host you typed, and carry the token only in the `Authorization` header.
- Anyone who gets the token can act as that Home Assistant user. If it leaks, delete the token in Home Assistant and remove the connection in Orbit.

## Checklist for a real instance (open)

- [ ] Add a connection to a real Home Assistant (note its version here: ______).
- [ ] A wrong token is refused with a clear message.
- [ ] `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` unset: the error names it. Set: the connection works.
- [ ] A calendar with a timed event, an all-day event and a recurring event shows correctly, including after a daylight saving change.
- [ ] A to-do list with open and completed items, a due date and a description shows correctly.
- [ ] Stopping Home Assistant keeps the last good data and reports the failure; starting it again recovers.
- [ ] Removing the connection removes everything it showed.
