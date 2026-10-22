# 0016 TRMNL display feed

Status: accepted. This replaces the earlier draft on passive display devices, which is withdrawn.

## Context

Some households want the dashboard on a wall-mounted e-ink screen. TRMNL is an e-ink display with a hosted service. Its owners write private plugins that poll a URL and render Liquid markup on the device's cloud side.

That means Orbit does not need its own display protocol, device pairing, renderer, or firmware handling. Orbit only needs to expose data that a TRMNL plugin can poll. Principle 7 excludes device control, discovery, and smart-home protocols. A read-only feed needs none of them.

## Decision

1. **Orbit publishes a read-only display feed.** A feed is a JSON endpoint with a feed token. The owner creates a feed, chooses what it includes, and copies the URL and token into a TRMNL private plugin that they own.
2. **The owner configures the TRMNL plugin.** Orbit does not publish a TRMNL plugin or a Recipe listing. It ships documentation with a sample Liquid template and polling settings.
3. **TRMNL renders the markup.** Orbit does not render images, run a headless browser, or talk to the device.
4. **No device pairing, device tokens, frame API, or firmware work.** The feed token is the only credential.

## Feed design

- **Token.** 256-bit random, stored only as a SHA-256 hash, shown once, read-only, bound to one feed, and revocable. This follows the invitation pattern in [ADR 0015](0015-household-invitations.md).
- **Transport.** The token is sent as `Authorization: Bearer <token>`. TRMNL private plugins accept custom polling headers (one `Name: Value` per line). The token is never in the URL path or query.
- **Content.** The owner picks an explicit allowlist of fields. A feed never exposes the whole household.
- **Size.** TRMNL's polling strategy requires the combined data to stay under 100 KB (checked against TRMNL's help center on 2026-10-22). Orbit caps a feed response at 64 KB, which leaves room for other URLs in the same plugin. The feed is built to fit and drops nothing silently: an owner who selects too much gets a validation error when saving the feed.
- **Freshness.** Responses are cacheable with `ETag`. TRMNL polls every 15 minutes at the fastest, or every 5 minutes with TRMNL+ (checked on 2026-10-22). TRMNL waits 10 seconds for an answer and retries once, so the endpoint must answer from stored data and never call out to third parties. The feed promises no freshness faster than five minutes.
- **Authorization.** A feed token is a new actor for `Authorizer` ([ADR 0007](0007-household-authorization-model.md)). It reads only its own feed. A token from one household asking for another household's feed gets the same 404 as any unknown id. The isolation kit and HTTP isolation suite must cover it.
- **Abuse limits.** The endpoint is public, so it is rate limited per token and per client address. Unknown, revoked, and wrong tokens all answer the same 404.

## Hosting requirement

TRMNL's cloud polls the feed URL, so an Orbit instance that uses this feature must be reachable from the internet over HTTPS. A LAN-only or tailnet-only install cannot use it. Use the HTTPS path from [ADR 0012](0012-docker-deployment.md). This conflicts with the LAN-first framing in [ADR 0014](0014-hosting-flavors-and-serverless.md), so the deployment docs must say it plainly.

Feed content also passes through TRMNL's cloud to be rendered. Owners must be told this before they create a feed.

## Scope and gating

- **Little to show yet.** Calendar and list data sources are not stored server side yet, and the budget module uses sample data only. The feed is built now with a field registry. The first fields are the household name, a dashboard name, and a dashboard's widget list. Calendar and list fields are registered when those sources land. Until then a feed is mostly useful for checking the setup end to end.
- **Decision.** Build the mechanism now, because the token, authorization and rate limit design is the part that needs review and testing, and it does not depend on the data.
- **Out of scope.** Other TRMNL modes, including self-hosted TRMNL servers that use a device protocol, are not part of this ADR.

## Consequences

- Removed from the plan: device pairing, device token storage, the frame API, the renderer port, artifact storage, and firmware handling. Issues that assumed them need reshaping.
- Added: a feed model, feed tokens, a feed endpoint, TRMNL setup documentation, and documentation of the public-reachability requirement.
- Principle 7 is unchanged. The feature is read-only export with no control and no discovery.
- Principle 4 (self-hostable first) has a note in `docs/product/principles-and-scope.md`. This feature needs public HTTPS and a third-party cloud for rendering, so it is optional and off until an owner creates a feed.
