# 0001 SQLite as the default database

Status: accepted

## Context

Target users are single households. Postgres adds a second container, credentials, and backup tooling to every install.

## Decision

SQLite is the default and only MVP database, used through repository ports. WAL mode, foreign keys on, versioned migrations. The driver is `node:sqlite` with plain SQL, see ADR 0009.

## Consequences

- Simple deployment: one volume.
- Single writer. Fine for household scale. Keep write transactions short.
- Backups must use `VACUUM INTO` or the online backup API.
- Avoid SQLite-only SQL in repositories where practical, so a Postgres adapter stays plausible later.
- The earlier "Postgres default" plan is superseded.
