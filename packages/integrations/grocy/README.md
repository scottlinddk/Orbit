# @orbit/integration-grocy

Read-only `IntegrationProvider` for Grocy ([ADR 0021](../../../docs/architecture/adr/0021-meals-and-grocy.md)).

It uses Grocy's REST API with an API key (sent in the `GROCY-API-KEY` header) and reads through the shared egress guard (the `EgressFetcher` port), so private addresses need the operator's opt-in.

| What                 | Request                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| Check and prove key  | `GET /api/system/info` (needs the key). Refuses a version older than 4.                 |
| Find shopping lists  | `GET /api/objects/shopping_lists`                                                       |
| Read a shopping list | `GET /api/objects/shopping_list` (rows of one list) and `GET /api/objects/products`     |
| Read the stock       | `GET /api/stock/volatile?due_soon_days=7`: expired, overdue, due soon and missing items |

Response shapes were checked against the OpenAPI description of Grocy's public demo (`demo.grocy.info/api/openapi/specification`, which reported version 4.7.1) on 2026-10-22. That description does not list a `done` column on shopping list rows, so the adapter reads `done` when it is present and treats a missing one as not done. Tests run against an in-process fake server, not a real Grocy.
