# HTTPS for a home network or a tailnet

Orbit's login cookie is `Secure` only when `ORBIT_PUBLIC_URL` starts with `https://`, and the API rejects writes from any other address. Plain HTTP over a LAN is therefore not a way to sign in from other devices. This page compares the three ways to get HTTPS without opening your home router to the internet.

Status: the commands below follow Tailscale's and Caddy's documentation. They have not yet been run end to end on a device by the maintainers, so the acceptance checklist at the bottom is open. Do it once and report the result on the issue.

## Recommended: Tailscale Serve

Tailscale Serve runs on the host and proxies HTTPS for your tailnet name to the loopback port Orbit already publishes. Nothing is reachable from the public internet. Do not use Funnel: it makes the service public.

1. In the Tailscale admin console, enable **MagicDNS** and **HTTPS certificates** for the tailnet.
2. Install Tailscale on the host and sign in: `sudo tailscale up`.
3. Find the machine's name: `tailscale status` (for example `pi.tail1234.ts.net`).
4. Tell Orbit its address, in `.env`:

   ```sh
   ORBIT_PUBLIC_URL=https://pi.tail1234.ts.net
   ```

5. Start Orbit and serve it: `docker compose up -d`, then `sudo tailscale serve --bg 3000`. Use `--https=<port>` only if you need a port other than 443.
6. On a phone or laptop signed in to the same tailnet, open `https://pi.tail1234.ts.net`.

Leave `ORBIT_TRUST_PROXY` at `false`. Tailscale's documentation does not state that Serve sets `X-Forwarded-For` or `X-Forwarded-Proto`, and Orbit does not need them: the `Secure` cookie and the Origin check depend on `ORBIT_PUBLIC_URL`, not on forwarded headers. The cost is that Orbit sees every request as coming from the host itself, so its per-address login rate limit is shared by everyone on the tailnet. For a household that is acceptable.

`ORBIT_TRUST_PROXY=true` is only safe when the proxy is the sole way to reach the container and it overwrites forwarded headers. The published port is loopback only, so that holds on a single host, but it buys nothing here.

The TRMNL feed cannot be used on a tailnet-only install, because TRMNL's cloud cannot reach it.

## Alternative: Caddy with its internal CA

Use this when you want a name like `orbit.home` and no Tailscale. Caddy creates its own certificate authority, and every device must trust that root certificate once. Use `tls internal` in the Caddyfile for your name, point your router's DNS (or each device's hosts file) at the machine, then install Caddy's root certificate (`/data/caddy/pki/authorities/local/root.crt` in the caddy-data volume) on each device. Set `ORBIT_PUBLIC_URL=https://orbit.home` and `ORBIT_TRUST_PROXY=true`. This takes more steps than Tailscale and phones make the certificate step awkward, which is why it is not the default.

## Alternative: Cloudflare Tunnel

No open ports and a public name, at the cost of all traffic passing through Cloudflare, who can see it. Run `cloudflared` on the host pointing at `http://127.0.0.1:3000`, set `ORBIT_PUBLIC_URL` to the tunnel's `https://` name and `ORBIT_TRUST_PROXY=true`. Read Cloudflare's terms and decide whether a third party seeing household data is acceptable. This path does work for the TRMNL feed because the name is public.

## Acceptance checklist (open)

- [ ] Tailscale Serve: sign-in works from a phone, the cookie has the `Secure` flag, and writes pass the Origin check.
- [ ] Caddy internal CA: same three checks.
- [ ] Cloudflare Tunnel: same three checks.
