# 0009 node:sqlite as the SQLite driver

Status: accepted, revisit if Node changes the API

## Context

ADR 0001 chose SQLite and left the driver open (better-sqlite3 with a query builder was the working assumption). Self-hosters run Orbit on Raspberry Pis, NAS boxes and small VPSes, where native modules mean prebuilt-binary gaps, compiler toolchains and bigger images.

## Decision

- Use Node's built-in `node:sqlite` (Node 22.16 or later, which also provides the online `backup()` API; the API runs its TypeScript sources through Node's type stripping, which is on by default from 22.18). No native dependency.
- Write plain SQL in the adapter. With a handful of tables a query builder adds more surface than it removes. Tables are `STRICT`.
- Forward-only, versioned migrations in `packages/adapters/persistence-sqlite/src/migrations.ts`, each applied in its own transaction, recorded in `schema_migrations`. A database written by a newer Orbit is refused.
- Foreign keys only inside an aggregate (household to members, dashboard to widgets). Cross-aggregate references stay application-level rules, which also keeps the in-memory and SQLite adapters behaviorally identical under the shared contract suite.
- Backups use SQLite's online backup (`backupDatabase`). Never copy the file by hand while Orbit runs, because WAL mode keeps recent writes in a separate file.

## Consequences

- `node:sqlite` is marked experimental in Node 22 and prints a warning. The API is small and confined to this one package, so a switch to better-sqlite3 would touch only the adapter. The repository contract suite and the isolation kit would catch regressions.
- The minimum supported Node version is 22.18. On 22.16 and 22.17 `node:sqlite` works but `node src/main.ts` fails with `ERR_UNKNOWN_FILE_EXTENSION` (checked by running the API on 22.16.0, 22.17.0 and 22.18.0). Revisit when Node marks `node:sqlite` stable.
- One writer at a time. Fine for household scale.
