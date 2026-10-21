# 0017 Planets: declarative, permission-scoped plugins

Status: proposed. Not accepted. Accepting it also needs the principle 3 and trust-model wording in `docs/product/principles-and-scope.md` to change, because the current text says a manifest does not imply sandboxing.

## Context

Today every widget is built in and ships with the application (`packages/widget-sdk`, `packages/modules/*`). Households want configurable sources, such as a weather strip or a chore list, without a code release. A Planet is a proposed way to ship that: a versioned package that declares a data source, templates, and a config form, and nothing else.

The risk is third-party reach. Anything a Planet can execute or request is a route into the household's data or network. The trust model therefore has to be stated before the format is fixed.

## Decisions proposed

1. **Tier 0 only.** A Planet is data: a manifest, HTTP or static data sources, and templates. It contains no executable code. Templates have no filesystem and no network access. WASM transforms and out-of-process containers are out of scope.
2. **Complete permission list.** The manifest's `permissions` block is the full set of capabilities. Anything not declared is denied. Installing shows every permission. A new permission or a major version needs explicit approval on update.
3. **Pinned versions.** Installs are recorded in a lockfile with a content digest. There are no automatic updates in the MVP.
4. **Admin-only install from a folder or ZIP.** No index, no marketplace. Index and signing are deferred until there are external authors, and need their own ADR.
5. **Egress goes through the shared guard.** Network access is limited to the manifest's host allowlist, through the same egress guard used by the ICS and CalDAV integrations ([ADR 0003](0003-calendar-integrations.md)). Private, loopback, and link-local addresses are blocked unless the administrator opts in for that host.
6. **Secrets stay server side.** Planet secrets live in the existing `SecretStore` ([overview](../overview.md)) and are injected only into outgoing requests. They never reach template context or logs.
7. **Widget identity.** Planet widgets use the type `planet.<id>`. The widget `type` is permanent (`packages/widget-sdk/README.md`), so the manifest `id` is permanent too.
8. **One config-form model.** `config_schema` is compiled into the existing `options` model in `packages/widget-sdk`, not a second form system.
9. **Template engine.** It must auto-escape by default, and raw output requires an explicit permission. The engine and its license are chosen in this ADR and checked against `tooling/check-licenses.mjs`.

## Manifest v1 (draft)

Fields: `schema_version`, `id` (reverse-DNS, immutable), `version` (SemVer), `name`, `authors`, `license` (SPDX), `orbit` (compatible version range), `permissions` (`network` hosts and methods, `secrets`, `storage`, `lan`), `config_schema`, `data_sources`, `refresh` (interval, minimum interval, jitter, back-off), `render` (targets and templates).

The JSON Schema for this block is the source of truth. Validation errors point at the failing field path.

## Gating

- No first-party Planets (calendar, weather, chores, lists) ship before week-1 validation (`docs/architecture/open-questions.md`). At most one fixture Planet, used as the authoring example.
- Index, signing, WASM, and OAuth are out of scope for this ADR.

## Consequences

- The Planet runtime and connectors can only be built after this ADR is accepted.
- The security model in `docs/architecture/security-model.md` (to be written) must cover every row above before Planet code merges.
- If this ADR is rejected, Planets stay out of scope and the related issues close as not planned.
