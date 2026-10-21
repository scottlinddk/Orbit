# 0016 TRMNL display feed

Status: proposed. Not accepted. This replaces the earlier draft on passive display devices, which is withdrawn.

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
- **Transport.** The token is sent in an HTTP header that the TRMNL plugin supports, never in the URL path.
- **Content.** The owner picks an explicit allowlist of fields. A feed never exposes the whole household.
- **Size.** Responses are capped to fit TRMNL's private plugin payload limit. The research reports 100 KB. Verify this against current TRMNL documentation before implementing.
- **Freshness.** Responses are cacheable with `ETag`. TRMNL's refresh floor depends on the owner's plan. The research reports a 15-minute floor without a paid tier, which is community-reported and needs checking. The feed promises no freshness faster than that.
- **Authorization.** A feed token is a new actor for `Authorizer` ([ADR 0007](0007-household-authorization-model.md)). It reads only its own feed. A token from one household asking for another household's feed gets the same 404 as any unknown id. The isolation kit and HTTP isolation suite must cover it.
- **Abuse limits.** The endpoint is public, so it is rate limited per token. Unknown, revoked, and wrong tokens all answer the same 404.

## Hosting requirement

TRMNL's cloud polls the feed URL, so an Orbit instance that uses this feature must be reachable from the internet over HTTPS. A LAN-only or tailnet-only install cannot use it. Use the HTTPS path from [ADR 0012](0012-docker-deployment.md). This conflicts with the LAN-first framing in [ADR 0014](0014-hosting-flavors-and-serverless.md), so the deployment docs must say it plainly.

Feed content also passes through TRMNL's cloud to be rendered. Owners must be told this before they create a feed.

## Scope and gating

- **Nothing to show yet.** The README says calendar and list data sources do not exist yet. The budget module uses sample data only. A useful feed depends on those sources and on the week-1 validation in `docs/architecture/open-questions.md`.
- **Timing.** Build the feed after calendar and lists sources exist, not before.
- **Out of scope.** Other TRMNL modes, including self-hosted TRMNL servers that use a device protocol, are not part of this ADR.

## Consequences

- Removed from the plan: device pairing, device token storage, the frame API, the renderer port, artifact storage, and firmware handling. Issues that assumed them need reshaping.
- Added: a feed model, feed tokens, a feed endpoint, TRMNL setup documentation, and documentation of the public-reachability requirement.
- Principle 7 is unchanged. The feature is read-only export with no control and no discovery.
- Principle 4 (self-hostable first) needs a note. This feature needs public HTTPS and a third-party cloud for rendering, so it is optional.
