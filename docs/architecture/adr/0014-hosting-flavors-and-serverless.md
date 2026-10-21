# 0014 Hosting flavors, and why serverless is out of scope

Status: accepted

## Context

People ask where Orbit can run. Serverless and PaaS hosts (Vercel, Netlify, Cloudflare Workers) are popular, so the answer should be deliberate. Vercel's own guidance says SQLite cannot be used there, because serverless storage is ephemeral and separate function instances cannot share one database file ([Vercel KB](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)).

Orbit is built around one long-running process with one SQLite file on a persistent volume:

- **Persistence.** `node:sqlite`, WAL, `PRAGMA` settings and the online backup API are all in `packages/adapters/persistence-sqlite` (ADR 0001, 0009). A Postgres or hosted libSQL adapter is plausible but would be a new adapter with its own migration and backup story.
- **Background work.** The hourly session purge in `apps/api/src/main.ts` runs on a `setInterval`, which does not run on serverless. It would need a scheduled job.
- **Migrations and snapshots.** They run on process start and write a snapshot to the data volume. On serverless they would be a deploy step.
- **Same origin.** The web app and API share one origin (ADR 0011, 0012). That keeps the session cookie `SameSite=Strict` and makes the Origin check exact. A static web app on a CDN with the API elsewhere changes the cookie and CSRF model and needs its own ADR.
- **Operator CLI.** Backup, restore and password reset assume a local file and a shell.
- **Live updates.** A future SSE or WebSocket feature would not fit a function model.

## Decision

Option (a): serverless and function-based hosting are **out of scope for the MVP**. No concrete household need requires them, and supporting them would mean a second storage adapter and a second security model.

Supported hosting flavors:

1. **Home server.** A Raspberry Pi, mini PC or NAS running Docker, reached over a LAN or a tailnet.
2. **VPS.** A rented Linux server running Docker, with the Caddy override for HTTPS.

Both run the same image with a persistent volume. Other platforms that offer a persistent volume and run a container (for example Fly.io or Railway) may work with the same image. They are untested and unsupported.

## Revisit when

A real household need appears that a home server or VPS cannot meet, or a Postgres adapter is built for another reason. The work would then be: a storage adapter, scheduled jobs for the purge, migrations as a deploy step, and an ADR for a cross-origin session model.

## Consequences

- `docs/operations/deployment.md` states the supported flavors and that serverless is not supported.
- No work is planned for Vercel, Netlify or Cloudflare Workers.
