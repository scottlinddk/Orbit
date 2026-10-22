# @orbit/integration-mealie

Read-only `IntegrationProvider` for Mealie ([ADR 0021](../../../docs/architecture/adr/0021-meals-and-grocy.md)).

It uses Mealie's REST API with an API token (sent as `Authorization: Bearer`) and reads through the shared egress guard (the `EgressFetcher` port), so private addresses need the operator's opt-in.

| What                 | Request                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| Check the version    | `GET /api/app/about` (no login). Refuses a version older than 2.         |
| Prove the token      | `GET /api/users/self`                                                    |
| Find shopping lists  | `GET /api/households/shopping/lists?perPage=100`                         |
| Read a shopping list | `GET /api/households/shopping/lists/<id>`                                |
| Read the meal plan   | `GET /api/households/mealplans?start_date&end_date&orderBy&perPage&page` |
| Read a recipe        | `GET /api/recipes/<slug>`                                                |

Response shapes were checked against the OpenAPI document of Mealie's public demo (`demo.mealie.io/openapi.json`, which reported version `nightly`) on 2026-10-22. Mealie 1 used `/api/groups/...` for meal plans and shopping lists, so a Mealie older than 2 is refused with a clear message instead of guessed at. Tests run against an in-process fake server, not a real Mealie.

Recipe images are left out on purpose: their address would reveal where Mealie runs.
