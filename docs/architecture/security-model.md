# Security model for the TRMNL feed and Planets

Status: draft, written ahead of the code. It covers the features proposed in [ADR 0016](adr/0016-trmnl-display-feed.md) and [ADR 0017](adr/0017-planets-declarative-plugins.md), neither of which is accepted yet. If an ADR is rejected, its rows are removed.

## Gate

No pull request that touches feed routes or `planets/` merges without the mitigation and the test for its row below. A row's test is named here before the code exists, so a reviewer can check the PR against it. When a test lands, replace "planned" with its path.

## Assets and actors

- **Assets.** Household data (calendar, lists, budget), Planet secrets in the `SecretStore`, session cookies, and the host's LAN and cloud metadata endpoints.
- **Feed token holder.** Anyone who has the token: the TRMNL cloud, the owner, and anyone the token leaks to. Read-only, one feed.
- **Planet author.** Untrusted. Controls the manifest and templates, nothing else.
- **Administrator.** Trusted. Installs Planets, approves permissions and egress hosts.
- **Anonymous internet client.** Can reach the public feed endpoint if the instance is exposed over HTTPS.

## Threats and mitigations

| #   | Threat                                                      | Mitigation                                                                                               | Test                                                                          |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Feed token leaked (for example pasted into a shared plugin) | Read-only. Bound to one feed. Revocable. The owner sees every feed and can revoke it. Hash only at rest. | Planned: revocation test in `packages/testing/src/isolation-kit.ts`           |
| 2   | Feed enumeration                                            | 256-bit random tokens. Identical 404 for unknown, wrong and revoked tokens. Rate limit per token.        | Planned: enumeration and rate-limit tests in `apps/api/src/feed.http.test.ts` |
| 3   | Feed exposes more than intended                             | Explicit field allowlist chosen by the owner. No whole-household export.                                 | Planned: allowlist test in `apps/api/src/feed.http.test.ts`                   |
| 4   | Cross-household read through a feed token                   | The token is an `Authorizer` actor bound to one feed. A foreign feed id answers the same 404.            | Planned: `isolation-kit.ts` and `apps/api/src/isolation.http.test.ts`         |
| 5   | Data exfiltration from a template or fetch                  | Egress allowlist. No network access in templates. Secrets never in template context or logs.             | Planned: secret-echo and egress tests under `packages/modules/planets`        |
| 6   | SSRF into the LAN or cloud metadata                         | Block private, loopback and link-local ranges after DNS resolution. Administrator opt-in per host.       | Planned: egress guard tests with DNS-rebinding fixtures                       |
| 7   | Supply-chain takeover of a shared Planet                    | Pinned content digests. No automatic updates. No shared install source in the MVP.                       | Planned: digest-mismatch test                                                 |
| 8   | Untrusted code execution                                    | Tier 0 only ([ADR 0017](adr/0017-planets-declarative-plugins.md)). A manifest is data.                   | Planned: manifest rejects code fields                                         |
| 9   | XSS through templates                                       | Auto-escaping on. Raw output needs an explicit permission.                                               | Planned: template injection fixtures                                          |
| 10  | Resource exhaustion                                         | Feed size cap. `min_interval`, jitter and back-off. Per-host rate limits.                                | Planned: cap and scheduler tests                                              |

## Residual risks

- **Third-party rendering.** Feed content passes through TRMNL's cloud. The owner is told before creating a feed. Orbit cannot control what TRMNL does with it.
- **Public exposure.** The feed requires an instance reachable over HTTPS. That widens the attack surface of the whole instance, not only the feed route. The deployment docs must say so.
- **Token in a TRMNL plugin.** The token lives in the owner's plugin settings on TRMNL. Revocation is the only recovery.
- **Administrator approval.** A careless administrator can approve a broad permission. The install screen lists every permission to make that visible.

## Notes

- Precedent from other plugin ecosystems, such as the Home Assistant custom-integration disclosures of 2021, is cited in the research. Verify the details before citing them in public documentation.
- This model is written for Orbit. Do not copy text from reference projects ([ADR 0006](adr/0006-apache-2-license.md) covers licensing).
