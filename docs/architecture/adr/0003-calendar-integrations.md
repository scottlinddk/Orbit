# 0003 Calendar integrations: ICS/CalDAV and Google

Status: accepted, with a scope warning

## Decision

Implement calendar sources behind one `IntegrationProvider` contract and map all of them to a platform-owned `CalendarEvent` model.

Order of delivery:

1. **ICS feed URL** (read-only). No OAuth. Proves the contract.
2. **CalDAV** (read, optionally write later).
3. **Google Calendar** via OAuth.

## Scope warning

The original plan said one external integration. Three providers is a larger commitment. If the schedule slips, ship ICS first and treat the rest as stretch.

## Google specifics

- Each self-hoster needs their own Google Cloud OAuth client. Calendar scopes are sensitive, and an unverified app has limits (testing mode refresh tokens can expire after 7 days). Document this honestly.
- Use the narrowest scope (`calendar.readonly` or `calendar.events.readonly`).
- Refresh tokens are encrypted via `SecretStore` and removed on disconnect, including token revocation.

## Security

- Outbound requests (ICS, CalDAV) use explicit timeouts, size limits, and SSRF protection (block private ranges unless the admin opts in, since self-hosters may legitimately use LAN CalDAV).
- Feed content is untrusted input and is parsed defensively.

## Egress guard (implemented)

Outbound fetches go through the `EgressFetcher` port (`packages/application/src/egress.ts`), implemented by `packages/adapters/egress-guard`. It resolves DNS once and connects to the address it checked, refuses loopback, private, link-local (which covers the cloud metadata address), carrier-grade NAT and reserved ranges for IPv4, IPv6 and mapped forms, re-checks every redirect hop, and caps size and time. An administrator can allow one host name at a time to resolve to a private address, which is how a LAN CalDAV server is reached. Nothing reads that allowlist from configuration yet, because no source uses the guard yet.
