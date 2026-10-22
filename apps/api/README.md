# @orbit/api

Fastify HTTP API. Wires adapters to the application layer in `src/main.ts` (production) and `src/test-support.ts` (tests).

## Run it

```sh
pnpm install
pnpm --filter @orbit/api start        # node src/main.ts, no build step on Node 22.18+
```

It creates the SQLite database and applies migrations on start.

```sh
curl -c jar -X POST localhost:3000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"username":"you","password":"a long passphrase"}'
curl -c jar -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"username":"you","password":"a long passphrase"}'
curl -b jar localhost:3000/api/v1/auth/me
```

The OpenAPI document is served at `/api/v1/openapi.json` and committed as [`openapi.json`](openapi.json).

## Configuration

All settings are environment variables. Invalid values stop the server with a readable message.

Under Docker Compose only `ORBIT_PUBLIC_URL`, `ORBIT_REGISTRATION`, `ORBIT_SETUP_CODE`, `ORBIT_TRUST_PROXY`, `ORBIT_MIGRATION_SNAPSHOTS`, `ORBIT_BACKUP_INTERVAL_HOURS`, `ORBIT_BACKUP_KEEP`, `ORBIT_SECRET_KEY`, `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, `ORBIT_TIME_ZONE` and `ORBIT_LOG_LEVEL` can be set (through `.env`). The image fixes `ORBIT_HOST`, `ORBIT_PORT`, `ORBIT_DATABASE_PATH` and `ORBIT_WEB_DIR`. [`.env.example`](../../.env.example) marks which applies where.

| Variable                           | Default                 | Purpose                                                                                                                    |
| ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ORBIT_DATABASE_PATH`              | `./data/orbit.sqlite`   | SQLite file. Its directory is created.                                                                                     |
| `ORBIT_HOST`                       | `127.0.0.1`             | Bind address. Use `0.0.0.0` in a container.                                                                                |
| `ORBIT_PORT`                       | `3000`                  | Port.                                                                                                                      |
| `ORBIT_PUBLIC_URL`                 | `http://localhost:3000` | The address people use in the browser. Sets the allowed `Origin` and whether cookies are `Secure`.                         |
| `ORBIT_REGISTRATION`               | `first-user-only`       | `first-user-only` or `open`.                                                                                               |
| `ORBIT_SETUP_CODE`                 | unset                   | Your own setup code for the first account (12 to 64 characters). Unset: a random one is printed in the log at start.       |
| `ORBIT_TRUST_PROXY`                | `false`                 | `true` only behind a reverse proxy you control, so rate limits use the real client IP.                                     |
| `ORBIT_WEB_DIR`                    | unset                   | Folder with the built web app (`apps/web/dist`). When set, the API serves it on the same origin. The Docker image sets it. |
| `ORBIT_MIGRATION_SNAPSHOTS`        | `5`                     | How many `backups/pre-migration-*.sqlite` snapshots to keep next to the database.                                          |
| `ORBIT_BACKUP_INTERVAL_HOURS`      | `24`                    | Hours between automatic `backups/scheduled-*.sqlite` backups. `0` turns them off.                                          |
| `ORBIT_BACKUP_KEEP`                | `14`                    | How many automatic backups to keep.                                                                                        |
| `ORBIT_SECRET_KEY`                 | unset                   | Master key (at least 32 characters) for stored secrets such as Planet API keys. Without it, secrets cannot be stored.      |
| `ORBIT_PLANETS_DIR`                | `<data folder>/planets` | Where installed Planets and `planets.lock` live.                                                                           |
| `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` | unset                   | Comma separated host names that outbound requests may reach although they resolve to a private address. Per host.          |
| `ORBIT_TIME_ZONE`                  | `UTC`                   | IANA time zone that decides what "today" means in the display feed, for example `Europe/Copenhagen`.                       |
| `ORBIT_LOG_LEVEL`                  | `info`                  | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                                                            |

Security design: [ADR 0010](../../docs/architecture/adr/0010-sessions-and-http-hardening.md).

## Tests

`pnpm test` runs the HTTP tests against in-memory and SQLite storage with a fast fake password hasher, plus one suite with real Argon2 and a SQLite file (`src/e2e.test.ts`).

After changing a route or schema: `pnpm --filter @orbit/api openapi`, then commit `openapi.json`.

## Operator commands

`node src/cli.ts <command>` (or `orbit <command>` in the Docker image): `backup`, `verify`, `restore`, `reset-password`. See [backup and restore](../../docs/operations/backup-and-restore.md).
