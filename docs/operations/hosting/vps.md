# Public VPS (Hetzner or similar) with Docker and Caddy

For a household that wants a public address, for example to share Orbit with family who do not use Tailscale, or to run it on a domain you own. Hetzner is the reference, but nothing here is provider specific.

Status: written from the documentation and the CI smoke tests. The Caddy override is not tested against a real certificate authority in CI. Follow the acceptance checklist at the bottom on a real server and record the result.

## Decision: other platforms

Container platforms with a persistent volume (Fly.io, Railway and similar) might run the same image. They are **not tested and not supported** for now. [ADR 0014](../../architecture/adr/0014-hosting-flavors-and-serverless.md) explains why serverless is out of scope: Orbit needs one process, one SQLite file and a persistent disk. A platform is in scope only when someone runs the smoke test on it and reports back.

## Steps

1. **Create the server.** Any small Linux VPS with 1 GB RAM or more. Create a non-root user with SSH keys and disable password SSH login.
2. **Firewall.** Allow only SSH (22), HTTP (80) and HTTPS (443) in. Docker bypasses `ufw` for published ports, so also rely on the Caddy override removing Orbit's own port. With `ufw`: `ufw default deny incoming && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable`. Also set the provider's cloud firewall to the same rules.
3. **DNS.** Point an `A` (and `AAAA` if you have IPv6) record for `orbit.example.com` at the server.
4. **Install Docker** with the Compose plugin (2.19 or later).
5. **Get Orbit and configure.**

   ```sh
   git clone https://github.com/scottlinddk/Orbit.git && cd Orbit
   echo 'ORBIT_DOMAIN=orbit.example.com' >> .env
   echo "ORBIT_SETUP_CODE=$(openssl rand -hex 16)" >> .env
   docker compose -f compose.yaml -f deploy/compose.caddy.yaml up -d --build
   ```

   `ORBIT_SETUP_CODE` stops a stranger from becoming the owner before you do: the first account needs it ([deployment](../deployment.md)). Keep `ORBIT_REGISTRATION` at its default `first-user-only`.

6. **Create the owner** at `https://orbit.example.com` with the setup code, then invite the rest of the household.
7. **Off-site backups.** Automatic backups land in `/data/backups` on the same disk. Copy them elsewhere daily, for example with `rclone` to S3-compatible object storage or a Hetzner Storage Box, from a cron job on the server. Encrypt before upload if the provider is not yours: a backup holds password hashes and household data.
8. **Update safely.** Back up, then `git pull && docker compose -f compose.yaml -f deploy/compose.caddy.yaml up -d --build`. Orbit snapshots before migrating.

## Using the TRMNL feed

The feed needs exactly this setup, because TRMNL's cloud polls the public address. See [TRMNL feed](../trmnl-feed.md) when it is available.

## Acceptance checklist (open)

- [ ] Followed from scratch on a fresh VPS, with the time taken written here.
- [ ] Caddy issued a certificate for the real domain. Result and date: ______
- [ ] From outside the server, a port scan shows only 22, 80 and 443.
- [ ] A backup restored onto a second server (the drill from `deploy/smoke-test.sh`, done by hand).
