# 0017 Planets: declarative, permission-scoped plugins

Status: accepted. The principle 3 and trust-model wording in `docs/product/principles-and-scope.md` changed in the same commit.

## Context

Today every widget is built in and ships with the application (`packages/widget-sdk`, `packages/modules/*`). Households want configurable sources, such as a weather strip or a chore list, without a code release. A Planet is a proposed way to ship that: a versioned package that declares a data source, templates, and a config form, and nothing else.

The risk is third-party reach. Anything a Planet can execute or request is a route into the household's data or network. The trust model therefore has to be stated before the format is fixed.

## Decisions

1. **Tier 0 for now.** A Planet is data: a manifest, HTTP or static data sources, and templates. It contains no executable code. Templates have no filesystem and no network access. WASM transforms and out-of-process containers are not part of this ADR. A later tier needs its own ADR. The manifest carries `schema_version` so a future tier does not break existing manifests.
2. **One install path for now.** An administrator installs a Planet from a local folder on the server. Other install methods (ZIP upload, a remote index, signed packages) are not decided here. Each needs its own ADR. The manifest does not name an install source, so a new install path does not change the manifest schema.
3. **Complete permission list.** The manifest's `permissions` block is the full set of capabilities. Anything not declared is denied. Installing shows every permission. A new permission or a major version needs explicit approval on update.
4. **Pinned versions.** Installs are recorded in a lockfile with a content digest. There are no automatic updates in the MVP.
5. **Egress goes through the shared guard.** Network access is limited to the manifest's host allowlist, through the same egress guard used by the ICS and CalDAV integrations ([ADR 0003](0003-calendar-integrations.md)). Private, loopback, and link-local addresses are blocked unless the administrator opts in for that host.
6. **Secrets stay server side.** Planet secrets live in the existing `SecretStore` ([overview](../overview.md)) and are injected only into outgoing requests. They never reach template context or logs.
7. **Widget identity.** Planet widgets use the type `planet.<id>`. The widget `type` is permanent (`packages/widget-sdk/README.md`), so the manifest `id` is permanent too.
8. **One config-form model.** `config_schema` is compiled into the existing `options` model in `packages/widget-sdk`, not a second form system.
9. **Template engine: LiquidJS** (MIT, no runtime dependencies). It uses the same Liquid language as TRMNL, so one template skill covers both. Output is HTML-escaped by default. Templates are loaded from memory only: no filesystem access, no `include`, `render` or `layout` tags that read files. The `raw` filter is removed unless the manifest declares the `raw_output` permission. Rendering has a time and output-size limit.

## Manifest v1 (draft)

Fields: `schema_version`, `id` (reverse-DNS, immutable), `version` (SemVer), `name`, `authors`, `license` (SPDX), `orbit` (compatible version range), `permissions` (`network` hosts and methods, `secrets`, `storage`, `lan`), `config_schema`, `data_sources`, `refresh` (interval, minimum interval, jitter, back-off), `render` (templates).

The JSON Schema for this block is the source of truth. Validation errors point at the failing field path.

## Relation to the TRMNL feed

[ADR 0016](0016-trmnl-display-feed.md) exposes Orbit data through a feed. A feed may later include Planet output. That is not part of the MVP, and this ADR does not decide it.

## Gating

- No first-party Planets (calendar, weather, chores, lists) ship before week-1 validation (`docs/architecture/open-questions.md`). At most one fixture Planet, used as the authoring example.
- Index, signing, WASM, and OAuth are out of scope for this ADR.

## Consequences

- The Planet runtime and connectors can only be built after this ADR is accepted.
- The security model in `docs/architecture/security-model.md` covers every row above. Planet code merges only with the test named in its row.
- If this ADR is rejected, Planets stay out of scope and the related issues close as not planned.
