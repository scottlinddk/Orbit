# Phase 0: architecture check for display devices and Planets

Status: working note. It supports ADR 0016 (TRMNL display feed) and ADR 0017 (Planets). It records what the repository already provides, and does not change code.

## Assumptions from the research

| ID  | Assumption                                       | Finding                                                                                                                                                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Backend HTTP API and a separate browser frontend | Confirmed. `apps/api` (Fastify, zod, OpenAPI, [ADR 0004](adr/0004-fastify-zod-openapi.md)) and `apps/web` (React SPA).                                                                           |
| A2  | Existing widgets could become Planets            | Partly. `packages/widget-sdk` defines `WidgetDefinition`. Built-in widgets in `packages/modules/*` use no data yet. Planets would add a new widget source. They do not replace built-ins.        |
| A3  | User and household model exists                  | Confirmed. [ADR 0002](adr/0002-local-accounts-auth.md), [ADR 0007](adr/0007-household-authorization-model.md), [ADR 0015](adr/0015-household-invitations.md).                                    |
| A4  | No stable public API                             | Partly. `apps/api/openapi.json` is generated from zod. Treat the current API as internal until a versioning decision is made.                                                                    |
| A5  | Backend language unknown                         | Node 22.18 and TypeScript. No single-binary requirement. Docker is the primary distribution ([ADR 0012](adr/0012-docker-deployment.md), [ADR 0014](adr/0014-hosting-flavors-and-serverless.md)). |
| A6  | Ships as one bundled stack                       | Confirmed. Modular monolith: one API process, one worker entry, one SPA ([overview](overview.md)).                                                                                               |

## Where proposed areas would live

| Proposed area              | Existing home                                                                      | Notes                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| TRMNL feed route and token | `apps/api` routes, `packages/application` for the feed actor                       | Extends `Authorizer` ([ADR 0007](adr/0007-household-authorization-model.md)). Add routes to the isolation kit and HTTP isolation suite. |
| Feed token storage         | `packages/application` ports, `packages/adapters/persistence-sqlite`               | Tokens stored as SHA-256 hashes, following the invitation pattern in ADR 0015.                                                          |
| Frame rendering            | Not needed. TRMNL renders the markup ([ADR 0016](adr/0016-trmnl-display-feed.md)). | No renderer port, no headless browser, no Chromium footprint.                                                                           |
| Artifact storage           | Not needed for the feed.                                                           | The `ObjectStorage` question in the overview is no longer blocked by this work.                                                         |
| Planet manifest and loader | New package, only if the dependency rules need a boundary                          | Check `tooling/dependency-cruiser.cjs` first.                                                                                           |
| Planet widgets             | `packages/widget-sdk` and `apps/web/src/widgets`                                   | Type `planet.<id>`. Config form reuses `options`.                                                                                       |
| Data connectors            | `packages/integrations/*`                                                          | `ical` reuses `packages/integrations/ics-calendar`.                                                                                     |
| Egress guard               | Shared by ICS, CalDAV and Planets                                                  | One implementation. ADR 0003 already requires SSRF protection.                                                                          |
| Secrets                    | Existing `SecretStore` port                                                        | No separate broker.                                                                                                                     |
| Scheduling                 | Existing `JobScheduler` port and `packages/adapters/jobs-sqlite`                   | The purge `setInterval` in `apps/api/src/main.ts` is not changed by this work.                                                          |

## Coupling hotspots

- **Widget data.** Widgets get only `config` and `span` props ([widget-sdk README](../../../packages/widget-sdk/README.md)). Planet data must reach widgets through an API, not through the widget context, to keep that rule.
- **Authorization.** `Authorizer` assumes a browser user with a household role. A feed token has no user and no role, and can read one feed. The actor model needs a small extension, described in ADR 0016.
- **Routes and OpenAPI.** Every route change needs `pnpm --filter @orbit/api openapi` and a committed `apps/api/openapi.json`.
- **Public reachability.** The TRMNL cloud polls the feed, so the feed must be reachable over public HTTPS. This is the main hosting conflict with ADR 0014.
- **Empty data sources.** Calendar and lists sources do not exist yet, so a feed has nothing useful to show until they do.

## Corrections to the research

- Its ADR paths `docs/adr/0001` to `0004` clash with existing ADRs. New decisions are ADR 0016 and 0017. The research's device protocol is replaced by the TRMNL feed in ADR 0016.
- Its `core/`, `api/`, `planets/` layout does not match the `packages/` layout. Use the table above.
- Its Postgres adapter, `orbit.yaml` config layer, and Caddy-by-default TLS conflict with ADR 0001, the environment-based config in `compose.yaml`, and ADR 0012.
- Its license decision is closed by ADR 0006.

## Baseline

`pnpm check` passed on this branch before this change (exit 0, lint, format, typecheck, tests, boundaries, licenses and build). This working note changes only Markdown.
