# Deploying Orbit with Docker

One container serves the web app and the API on one port and keeps everything in one SQLite file on a volume. You need Docker with the Compose plugin.

## Quick start

```sh
git clone https://github.com/scottlinddk/Orbit.git
cd Orbit
docker compose up -d --build
```

Open <http://localhost:3000>. Choose **Create the first account**. That account becomes the owner. Registration then closes (see [Adding people](#adding-people)).

Compose binds the port to `127.0.0.1` only. To reach Orbit from other devices, put HTTPS in front of it (next section). Do not publish the plain HTTP port to the internet: the session cookie would travel unencrypted.

## Settings

Copy `.env.example` to `.env` next to `compose.yaml` and change what you need. Every variable is documented in [`apps/api/README.md`](../../apps/api/README.md). The ones that matter for Docker:

| Variable             | Why                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORBIT_PUBLIC_URL`   | The address people type in the browser. Must match exactly, because the API rejects writes from any other origin. Use `https://...` behind a proxy. |
| `ORBIT_HOST_PORT`    | The port on this machine. Default 3000. The default `ORBIT_PUBLIC_URL` (`http://localhost:<port>`) follows it.                                      |
| `ORBIT_TRUST_PROXY`  | `true` only behind a reverse proxy you control, so rate limits see real client addresses.                                                           |
| `ORBIT_REGISTRATION` | `first-user-only` (default) or `open`.                                                                                                              |

## HTTPS with Caddy

Point a DNS name at the machine and open ports 80 and 443. Then:

```sh
echo 'ORBIT_DOMAIN=orbit.example.com' >> .env
docker compose -f compose.yaml -f deploy/compose.caddy.yaml up -d --build
```

Caddy gets and renews the certificate by itself. The override sets `ORBIT_PUBLIC_URL` and `ORBIT_TRUST_PROXY` for you, and removes Orbit's own published port, so the only way in is through Caddy. With HTTPS the session cookie becomes `Secure` and `__Host-` prefixed automatically. If you use another proxy, forward to port 3000, set `ORBIT_PUBLIC_URL` to the public https address and `ORBIT_TRUST_PROXY=true`.

## Adding people

By default only the first account can register on the web page. To add a household member, create their account on the server and then let the owner add them to the household:

```sh
docker compose exec orbit orbit create-user bobby     # asks for a password, hidden
```

Give them the password to change later, then in the household page the owner adds `bobby` **by username**. Setting `ORBIT_REGISTRATION=open` instead lets anyone who can reach the page create an account, which is only sensible on a private network.

## Data

All data is in the `orbit-data` volume (`/data/orbit.sqlite`). The container runs as an unprivileged user, its root filesystem is read-only, and all Linux capabilities are dropped. Nothing writes outside `/data`.

## Backup, restore, password reset

The image includes an `orbit` command. Details and the tested procedure are in [backup and restore](backup-and-restore.md).

```sh
docker compose exec orbit orbit backup /data/backups/orbit-$(date +%F).sqlite
docker compose exec orbit orbit verify /data/backups/orbit-$(date +%F).sqlite
docker compose exec orbit orbit create-user bobby         # add an account, hidden password prompt
docker compose exec orbit orbit reset-password alice      # asks for the new password, hidden
```

Keep copies **outside** the volume (`docker compose cp`, see the backup page). A backup that lives only in the same volume does not survive losing it.

## Upgrading

```sh
docker compose exec orbit orbit backup /data/backups/before-upgrade.sqlite
git pull
docker compose up -d --build
```

Database migrations run when Orbit starts and are forward-only. A database written by a newer Orbit is refused, so you cannot silently downgrade. To go back, restore the backup you took first.

## Troubleshooting

### Sign-in or registration fails with 403 `origin-not-allowed`

Orbit accepts writes only from the exact address in `ORBIT_PUBLIC_URL`. The browser must use that address, character for character. Two common causes:

- You opened `http://127.0.0.1:3000` but the default is `http://localhost:3000`. Use `localhost`, or set `ORBIT_PUBLIC_URL=http://127.0.0.1:3000` in `.env`.
- You reached Orbit through a different host name, a proxy, or `https://`. Set `ORBIT_PUBLIC_URL` to the address people actually type, then `docker compose up -d`.

If you only change `ORBIT_HOST_PORT`, nothing else is needed: the default public URL follows it. If you set `ORBIT_PUBLIC_URL` yourself, its port must match.

## Logs and health

```sh
docker compose logs -f orbit      # JSON lines. Cookies and passwords are never logged.
docker compose ps                 # shows (healthy) from the built-in health check
```

`GET /api/v1/health` answers `{"status":"ok"}` without touching the database. It says the process is up, not that the data is fine.

## Known limits

- One instance, one SQLite file. There is no clustering, and none is planned for household use.
- No email. A forgotten password is reset on the server with `orbit reset-password`.
- Rate limits are in memory and per client address. They reset when Orbit restarts.
- The image builds from source with `docker compose build`. Published images are not set up yet.
