# Deploying Orbit with Docker

One container serves the web app and the API on one port and keeps everything in one SQLite file on a volume. You need Docker with the Compose plugin, version 2.19.0 or later (`docker compose version`). Older Compose releases do not understand the `!reset` tag in the Caddy override: they raise no error, but keep Orbit's own loopback port published next to Caddy. Debian and Ubuntu `docker-compose-plugin` packages from distribution repositories can be older, so install Docker from Docker's own repository.

## Where Orbit can run

| Flavor      | Supported | Notes                                                                                                                                              |
| ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home server | Yes       | Raspberry Pi, mini PC or NAS with Docker. Keep it private, or reach it over a tailnet.                                                             |
| VPS         | Yes       | Any Linux server with Docker. Use the Caddy override below for HTTPS.                                                                              |
| Serverless  | No        | Vercel, Netlify and Cloudflare Workers have no persistent file system. See [ADR 0014](../architecture/adr/0014-hosting-flavors-and-serverless.md). |
| Other PaaS  | Untested  | A container platform with a persistent volume may work with the same image.                                                                        |

## Quick start

```sh
git clone https://github.com/scottlinddk/Orbit.git
cd Orbit
docker compose up -d --build
```

Until the first tagged image is published, build from source as above. After that, Compose can pull
the published multi-architecture image with `docker compose pull && docker compose up -d`. To run a
specific release, set `ORBIT_IMAGE_TAG` in `.env` to its version without the `v` prefix (for example,
`0.1.0`). `docker compose up -d --build` always builds the current checkout.

Open <http://localhost:3000>. Choose **Create the first account**. It asks for a **setup code**, which Orbit printed in its log when it started:

```sh
docker compose logs orbit | grep -A1 "setup code"
```

That account becomes the owner. Registration then closes (see [Adding people](#adding-people)).

### Why a setup code

Until the owner exists, anyone who can reach the page could register and become the owner. On a public domain that is a takeover path, so the first account needs a code that only someone with access to the server log has. The code is random, shown once per start, kept only as a hash in memory, and discarded as soon as the owner exists. The API never returns it.

- **Lost it, or restarted before registering?** Restart Orbit (`docker compose restart orbit`) and read the new code from the log. A new code is made each start while there is no owner.
- **Want to choose it yourself?** Set `ORBIT_SETUP_CODE` (12 to 64 characters) in `.env`. Remove it after setup.
- **Prefer not to use the web page?** Create the owner on the server with `docker compose exec orbit orbit create-user <name>`. That needs no code. Once an account exists, the code is no longer asked for.
- `ORBIT_REGISTRATION=open` has no setup code, because it lets anyone register by design.

Compose binds the port to `127.0.0.1` only. To reach Orbit from other devices, put HTTPS in front of it (next section). Do not publish the plain HTTP port to the internet: the session cookie would travel unencrypted.

## Settings

Copy `.env.example` to `.env` next to `compose.yaml` and change what you need. Every variable is documented in [`apps/api/README.md`](../../apps/api/README.md). The ones that matter for Docker:

| Variable                           | Why                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORBIT_PUBLIC_URL`                 | The address people type in the browser. Must match exactly, because the API rejects writes from any other origin. Use `https://...` behind a proxy. |
| `ORBIT_HOST_PORT`                  | The port on this machine. Default 3000. The default `ORBIT_PUBLIC_URL` (`http://localhost:<port>`) follows it.                                      |
| `ORBIT_TRUST_PROXY`                | `true` only behind a reverse proxy you control, so rate limits see real client addresses.                                                           |
| `ORBIT_REGISTRATION`               | `first-user-only` (default) or `open`.                                                                                                              |
| `ORBIT_IMAGE_TAG`                  | Published image tag to pull. Defaults to `latest`.                                                                                                  |
| `ORBIT_SECRET_KEY`                 | Master key (at least 32 characters) for stored secrets such as Planet API keys. See [Planets](planets.md).                                          |
| `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` | Host names that outbound requests may reach on your local network. Per host. Empty by default.                                                      |

Check settings and the running instance from inside the container:

```sh
docker compose exec orbit orbit config validate
docker compose exec orbit orbit config print --redacted
docker compose exec orbit orbit doctor
```

`doctor` checks whether the data folder is writable, whether the configured URL's health endpoint
answers from the server, and whether its HTTP Date is within five minutes of the local clock. It
also warns when a non-local URL uses plain HTTP. Check public reachability separately from a device
outside your network; a successful request from the server does not prove external access.

## HTTPS with Caddy

Point a DNS name at the machine and open ports 80 and 443. Then:

```sh
echo 'ORBIT_DOMAIN=orbit.example.com' >> .env
docker compose -f compose.yaml -f deploy/compose.caddy.yaml up -d --build
```

Caddy gets and renews the certificate by itself. The override sets `ORBIT_PUBLIC_URL` and `ORBIT_TRUST_PROXY` for you, and removes Orbit's own published port, so the only way in is through Caddy. With HTTPS the session cookie becomes `Secure` and `__Host-` prefixed automatically. If you use another proxy, forward to port 3000, set `ORBIT_PUBLIC_URL` to the public https address and `ORBIT_TRUST_PROXY=true`.

The TRMNL display feed requires a public HTTPS address because TRMNL's cloud polls it. The Caddy
override is the documented deployment path for that feature, and [the feed guide](trmnl-feed.md) walks through it. A LAN-only
install cannot use the feed.

## Adding people

By default only the first account can register on the web page, but owners can bring in everyone else without touching the server:

1. Sign in as an owner and open the household page.
2. Under **Invite someone**, pick a role and choose **Create invitation link**.
3. Copy the link and send it to the person privately. It is shown only once, works once, and expires after 7 days.
4. They open the link, choose their own username and password, and land in the household.

Open invitations are listed on the same page and can be revoked. If a link is lost, revoke it and make a new one: Orbit keeps only a hash of the secret and cannot show it again. The link looks like `https://orbit.example.com/join#<secret>`. The secret sits after the `#`, which browsers never send to the server, so it does not appear in logs. The link uses the address in your browser's address bar, so open Orbit at the address you want to hand out (the one in `ORBIT_PUBLIC_URL`).

Other ways, when you do have shell access or the person already has an account:

```sh
docker compose exec orbit orbit create-user bobby     # asks for a password, hidden
```

Then in the household page the owner adds `bobby` **by username**. Setting `ORBIT_REGISTRATION=open` instead lets anyone who can reach the page create an account, which is only sensible on a private network. Design notes are in [ADR 0015](../architecture/adr/0015-household-invitations.md).

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

After the first tagged image is available, installations using the published image can instead run
`docker compose pull && docker compose up -d`.

Database migrations run when Orbit starts and are forward-only. Before applying one to a database that has data, Orbit writes a snapshot to `/data/backups/pre-migration-*.sqlite` and refuses to migrate if that fails ([details](backup-and-restore.md#automatic-snapshot-before-an-upgrade)). The manual backup above is still worth taking, because it can be copied off the machine. A database written by a newer Orbit is refused, so you cannot silently downgrade. To go back, restore the backup you took first.

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
- The release workflow publishes amd64 and arm64 images to GHCR after native smoke tests on both
  architectures. A Raspberry Pi deployment still needs a physical-device check before that issue
  can be closed.
