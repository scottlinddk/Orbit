# 0003 Calendar integrations: ICS/CalDAV and Google

Status: accepted, with a scope warning

## Decision

Implement calendar sources behind one `IntegrationProvider` contract and map all of them to a platform-owned `CalendarEvent` model.

Order of delivery:

1. **ICS feed URL** (read-only). No OAuth. Proves the contract.
2. **CalDAV** (read, optionally write later).
3. **Google Calendar** via OAuth.

## Update 2026-10-22: ICS only for now

ICS shipped (issue 12, [calendar guide](../../operations/calendar.md)). **CalDAV and Google are deferred, and no work on them is planned.** Reasons:

- A read-only ICS "secret address" already covers Nextcloud, Fastmail, iCloud and Google itself for the job this product validates: seeing the week's events on a shared screen. CalDAV adds discovery, authentication and sync tokens to read the same events.
- Google needs a per-household OAuth client, and an unverified app's refresh tokens can expire after 7 days (see below). That is a poor default for a self-hoster.
- The Home Assistant adapter (issue 16) reaches `calendar.*` entities, which include CalDAV and Google calendars, without Orbit owning those protocols.

Revisit CalDAV only if a household needs writes or a server that offers no ICS address. The `CalendarFeedReader` port and the `CalendarEvent` model stay provider neutral, so a second provider is an adapter and not a redesign.

An ICS address is a credential. Orbit stores it in the `SecretStore` (encrypted, needs `ORBIT_SECRET_KEY`) and keeps only the host name in the database, so no API response, log line or backup of the database alone reveals it.

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

Outbound fetches go through the `EgressFetcher` port (`packages/application/src/egress.ts`), implemented by `packages/adapters/egress-guard`. It resolves DNS once and connects to the address it checked, refuses loopback, private, link-local (which covers the cloud metadata address), carrier-grade NAT and reserved ranges for IPv4, IPv6 and mapped forms, re-checks every redirect hop, and caps size and time. An administrator can allow one host name at a time to resolve to a private address, which is how a LAN CalDAV server is reached. The allowlist is read from `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, and household calendars, ICS Planets and the guard tests all use the same fetcher.
