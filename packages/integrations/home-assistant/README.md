# @orbit/integration-home-assistant

Read-only `IntegrationProvider` for Home Assistant ([ADR 0019](../../../docs/architecture/adr/0019-connections-and-home-assistant.md)).

It uses Home Assistant's REST API with a long-lived access token and reads through the shared egress guard (the `EgressFetcher` port), so private addresses need the operator's opt-in.

| What                 | Request                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| Find calendars       | `GET /api/calendars`                                                        |
| Find to-do lists     | `GET /api/states`, keeping `todo.*`                                         |
| Read calendar events | `GET /api/calendars/<entity_id>?start=<iso>&end=<iso>`                      |
| Read a to-do list    | `POST /api/services/todo/get_items?return_response` with `{"entity_id": …}` |

Response shapes were checked against the Home Assistant core source on 2026-10-22 (`homeassistant/components/calendar` and `todo`; the REST documentation example reports version 2026.10). They are not covered by a stability promise from Home Assistant, so a new release can break this adapter. Tests run against an in-process fake server, not a real Home Assistant.
