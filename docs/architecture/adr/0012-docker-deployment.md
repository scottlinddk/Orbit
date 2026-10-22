# 0012 Docker deployment

Status: accepted

## Decisions

- **One image, one process, one port.** The API serves the built web app. Same origin means the cookie can be `SameSite=Strict` and the Origin check is exact. No separate web server or CORS.
- **Node runs the TypeScript sources directly** (type stripping, Node 22.18 or later), so there is no bundler or compile step in the API. The workspace layout stays intact in the image because Node does not strip types for files under `node_modules`, and `pnpm deploy` would copy the workspace packages there. `erasableSyntaxOnly` keeps the code compatible.
- **Alpine base**, multi-stage: one stage builds the web app, one installs only the API's production dependencies (`pnpm install --prod --filter "@orbit/api..."`), the runtime stage copies the results. About 190 MB, mostly the Node binary. No compiler, no pnpm, no dev dependencies in the final image.
- **Locked down by default:** unprivileged user, read-only root filesystem, `tmpfs` for `/tmp`, all capabilities dropped, `no-new-privileges`, port bound to loopback. Only `/data` is writable.
- **HTTPS is not in the app.** A reverse proxy terminates it (Caddy override included). `ORBIT_PUBLIC_URL` tells Orbit its public address, which decides cookie flags and the allowed Origin.
- **Health check:** liveness only (`/api/v1/health`), no database access, nothing revealed.
- **Operator CLI** (`orbit backup|verify|restore|reset-password`) ships in the image, because a self-hosted app with no email needs a way to recover access, and backups are only real if restoring is routine.
- **Backups are single files.** SQLite's online backup copies the WAL flag, so the result is switched to the classic journal. It then opens from a read-only mount with no side files.
- **Restore is cautious:** verifies first, refuses while the database is in use (the `-shm` file is the signal), and keeps the old database aside.

## Caching and CSP

Fingerprinted `/assets/*` are cached for a year, everything else `no-cache`. The web app gets a strict Content Security Policy (own origin only, no inline script or style, no framing). API responses get an empty one. A browser test fails on any violation.

## Found while testing the image

- Docker builds need `CI=true` so pnpm does not wait for a terminal.
- `pnpm fetch` fills the virtual store with every package, so the production stage must not start from it (image went from 380 MB to 190 MB).
- A backup mode of WAL and a restricted file mode each made `restore` fail from a read-only mount. Both are now handled, tested, and explained to the user.

## Consequences

- Building needs network access to the npm registry. Published images and signing are future work.
- `node:sqlite` still prints an experimental warning, which the image silences. See ADR 0009.
- Running more than one container against the same volume is unsupported.

## Amendment 2026-10-22: public HTTPS for the TRMNL feed

The TRMNL feed ([ADR 0016](0016-trmnl-display-feed.md)) needs a public HTTPS address, because TRMNL's cloud polls it. Decision: the Caddy override stays optional and the default stays loopback-only, so a plain install exposes nothing. The Caddy override is the documented path for owners who create a feed. A LAN-only or tailnet-only install cannot use the feed, and the docs say so. No local CA path is added until a real user needs one.
