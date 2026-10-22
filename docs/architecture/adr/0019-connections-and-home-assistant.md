# 0019 Connections to other systems, and Home Assistant

Status: accepted

## Context

Households that run Home Assistant already keep calendars and to-do lists there (issue 16). Building each calendar type or list store into Orbit is more work than reading them. Mealie and Grocy (issues 17 and 19) are the same shape: a self-hosted system with an address, a token, and data Orbit can show. This ADR adds one reusable framework and the first provider. It does not add writes.

## Decisions

1. **A Connection is household scoped.** It has a kind (`homeassistant` now), a name, a host, and a list of mirrors. The address and the access token are credentials of the other system. They live in the `SecretStore` (scope `connection:<id>`, names `url` and `token`) and are never returned, logged, or put in an error message. The API and the database keep only the host (`host[:port]`). Without `ORBIT_SECRET_KEY` nothing can be saved, and the owner is told which setting is missing.
2. **Owners manage connections.** A new action `connection:manage` is owner only ([ADR 0007](0007-household-authorization-model.md)). Members, children and devices never see a connection. They see its mirrored calendars and lists through the existing `calendar:view` and `list:view` actions, which is all a household screen needs.
3. **An `IntegrationProvider` port** in `packages/application` is the one contract: `parseAddress`, `discover` (proves the credential and lists what could be mirrored), `readCalendar` and `readTodoList`. It maps the other system's formats into the platform models (`CalendarEvent`, the source-neutral `TodoList`) so nothing vendor specific leaks. One implementation per kind lives under `packages/integrations/`. Mealie and Grocy add a kind and a package, not a new framework.
4. **All outbound calls use the shared egress guard** ([ADR 0003](0003-calendar-integrations.md)). Home Assistant usually runs on the LAN, so the operator lists its host in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, per host, as for ICS and OIDC. A refused address says exactly that setting in the error. Requests are pinned to the host the owner typed (`allowedHosts`), carry the token in the `Authorization` header only (which the guard does not forward after a redirect), and have size and time limits.
5. **Mirrors are chosen by the owner and are read only.** The owner picks calendar and to-do entities from what the other system reports. The chosen set is stored on the connection as `{entityId, role, name}`. Calendars join the existing `GET /households/:id/calendar/events` response, each with a source status that carries the entity's name. To-do lists join `GET /households/:id/lists` as lists marked `readOnly` with a `source` kind. They are not stored in Orbit's list tables, so they have no rows to drift: their id is `<connectionId>:<entityId>` (Orbit's own ids never contain a colon). Every change to such a list answers `422` with a message that says to change it in the other system. A user without `list:edit` still gets `403`, and a list of another household still gets the same `404` as a missing one.
6. **Caching.** Calendars are read at most every five minutes and lists every minute per entity, one read at a time however many people ask, and a failed refresh keeps serving the last good copy and reports why (`ok: false` and `error` on the source, `syncError` on the list). The display feed ([ADR 0016](0016-trmnl-display-feed.md)) never waits for the other system: it uses the cache and refreshes in the background.
7. **Limits.** At most 5 connections per household and 20 mirrors per connection. At most 2000 events per calendar read and 1000 items per list.
8. **Home Assistant adapter.** It uses the REST API with a long-lived access token: `GET /api/states` (to find `todo.*` and to prove the token), `GET /api/calendars`, `GET /api/calendars/<entity_id>?start=&end=`, and `POST /api/services/todo/get_items?return_response`. The response shapes were checked against the Home Assistant core source on 2026-10-22 (the `calendar` and `todo` components; the REST documentation example reports version 2026.10). Home Assistant does not promise these shapes are stable, so a release can break the adapter. Tests use an in-process fake server, never a real instance, so the guide carries a checklist for a real one.
9. **Writes are out.** Ticking off a Home Assistant item from Orbit needs `todo.update_item`, a token with more reach, and a conflict story. That is a separate decision.

## Consequences

- One new table (`connections`), one new integration package (`@orbit/integration-home-assistant`), no new runtime dependency.
- `HouseholdList` gains an optional `source`. The list API gains `readOnly`, `source` and `syncError`. The calendar source status gains an optional `name`.
- `SecretsNotConfiguredError` now covers access tokens as well as calendar addresses.
- Security model row 11 covers the token and the mirrored data ([security model](../security-model.md)).
- Mealie and Grocy are covered by [ADR 0021](0021-meals-and-grocy.md).
- Not covered: Tandoor, writes, OAuth for Home Assistant, push updates (the WebSocket API), and entities other than calendars and to-do lists.
