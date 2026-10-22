# Architecture overview

A modular monolith with ports and adapters. One deployable API process, one worker entry, one SPA.

## Layers

| Layer                          | Package                | May import                             |
| ------------------------------ | ---------------------- | -------------------------------------- |
| Contracts                      | `packages/contracts`   | zod only                               |
| Domain                         | `packages/domain`      | nothing external                       |
| Application (use cases, ports) | `packages/application` | `domain`, `contracts`                  |
| Adapters                       | `packages/adapters/*`  | `application`, `domain`, vendor SDKs   |
| Composition root, HTTP         | `apps/api`             | everything, wires adapters from config |
| Web                            | `apps/web`             | `contracts`, module `web/` entries     |

Domain and application code never import SQLite drivers, Google SDKs, or Fastify. This is enforced in CI (ADR 0005).

## Ports (MVP)

Only ports with a real boundary, security need, or plausible replacement:

- `UserRepository`, `HouseholdRepository`, `DashboardRepository`
- `ListRepository` (Orbit's own shared shopping and to-do lists, [lists](../operations/lists.md)). The household list model maps into the source-neutral `TodoList`, so a future Home Assistant or Grocy adapter targets the same shape without sharing this store.
- `PasswordHasher`, `SessionStore` (local accounts, ADR 0002)
- `SecretStore` (integration credentials, encrypted at rest; `adapters/secrets-encrypted-db`)
- `JobScheduler` (sync jobs; `adapters/jobs-sqlite`)
- `EgressFetcher` (every outbound request to a user-supplied URL; `adapters/egress-guard`)
- `PlanetStateStore` (what a Planet last fetched; `adapters/planets-sqlite`)
- `IntegrationProvider` (read-only access to another system such as Home Assistant, ADR 0019; ICS calendars use their own reader, ADR 0003)
- `AuthorizationService` (platform-owned policies)

Deferred until a feature needs them: `ObjectStorage`, multiple identity providers.

## Secrets

Runtime credentials (for example Google OAuth refresh tokens) are encrypted in the database with a master key supplied through the environment. They are never returned by the API or written to logs. Disconnecting an integration deletes the stored credential.

## Backup and restore

SQLite is a single file. Backups use `VACUUM INTO` or the SQLite online backup API, never a plain copy of a live file. Restore is tested in CI from an empty directory.
