# 0016 Passive display devices (scope)

Status: proposed. Not accepted. Acceptance changes `docs/product/principles-and-scope.md` (principle 7 and the MVP out-list), so it needs an explicit owner decision.

## Context

Principle 7 says Orbit has no device discovery, control, or smart-home protocols. Some households want a wall-mounted or e-ink screen that shows the dashboard without a browser. Such a screen could pull a rendered image from Orbit. That is a different shape from smart-home control: the device only fetches frames and reports health. The question is whether that is in scope at all, and if so, what it is allowed to do.

## Options

1. **Out of scope.** A browser kiosk pointed at the existing web app covers the use case. No new surface.
2. **Display clients as a class.** Browsers and passive displays that pull an image. No discovery, no control, no push, no MQTT or Home Assistant integration.
3. **Option 2 plus an optional compatibility adapter** for existing open-firmware e-ink devices, off by default.

## Recommendation

Option 1 until week-1 household validation passes (`docs/architecture/open-questions.md`). Revisit option 2 after that. Option 3 is deferred until a maintainer owns a test device.

## If option 2 or 3 is accepted

- **Explicit exclusions:** no device discovery, no control of anything, no smart-home protocols, no server push to devices in the MVP.
- **Client identity.** Devices are a principal separate from browser sessions. They pair with a short code confirmed by a household owner, and receive a per-device token. Tokens are random, at least 128 bits, stored only as a hash, revocable, and rotatable. Session hardening in ADR 0010 does not apply to devices.
- **Authorization.** Device routes go through the same `Authorizer` as everything else ([ADR 0007](0007-household-authorization-model.md)). A device from one household asking for another household's frame gets `NotFoundError`, the same as any foreign id. The isolation kit and HTTP isolation suite must cover device routes.
- **Protocol surface.** Frame descriptor, artifact fetch with `ETag`, telemetry, bounded logs. Status codes are HTTP-native. No firmware update or reset commands in v1. Firmware distribution is out of scope until a separate decision.
- **Principle wording.** Principle 7 is rewritten to exclude control and discovery explicitly, rather than excluding "devices" in general.
- **Frame artifacts.** `ObjectStorage` is deferred in `docs/architecture/overview.md`. Storing rendered images needs its own decision (SQLite blob or disk), recorded here or in a follow-up ADR.
- **Hosting.** Devices must reach the server over the LAN or a tailnet, or through the HTTPS proxy from ADR 0012. Serverless hosting remains out of scope ([ADR 0014](0014-hosting-flavors-and-serverless.md)).

## Consequences

- No code is written for devices until this ADR is accepted.
- If option 1 is accepted, the related issues close as not planned and this file is marked as rejected.
