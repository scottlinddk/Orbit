# Principles and scope

Orbit is a personal and household dashboard. It is not an IoT hub, a generic website builder, or a replacement for every productivity app.

## Principles

1. **User control.** Users decide where Orbit runs and where data lives.
2. **Small core, composable modules.** Optional capabilities live in modules.
3. **Useful before extensible.** One excellent dashboard before a plugin ecosystem. The only extension format is a declarative Planet (data and templates, no code) installed by an administrator from a local folder ([ADR 0017](../architecture/adr/0017-planets-declarative-plugins.md)). No marketplace, no executable plugins.
4. **Self-hostable first.** Core features work without third-party cloud services. Integrations may need external accounts. The optional TRMNL feed ([ADR 0016](../architecture/adr/0016-trmnl-display-feed.md)) needs a public HTTPS address and TRMNL's cloud to render the screen. It is off until an owner creates a feed.
5. **Portable.** Platform-owned data can be exported in a documented format.
6. **Secure by default.** Server-side authorization everywhere. Integrations get only the access they need.
7. **No IoT scope creep.** No device discovery, control, or smart-home protocols.
8. **No forced AI.** Every feature works without it.
9. **Progressive complexity.** A single household can run it simply.

## Initial job to validate

> Help a household see the week's calendar, shared tasks, and shopping or household lists in one configurable view.

This is a hypothesis. Week 1 interviews confirm or replace it.

## MVP scope

In: dashboard with configurable widgets, users and households, server-side authorization, a few built-in widgets, calendar integrations (see ADR 0003), documented container deployment, export, tested backup and restore, household-isolation security tests, public docs.

In (added by ADR 0016 and 0017): a read-only TRMNL display feed, and Tier 0 Planets installed from a local folder.

Out: IoT, generic automation engine, plugin marketplace, executable plugins (WASM or containers), multiple database or identity providers, microservices, RBAC editors, native mobile apps, mandatory AI, hosting or payments.

## Trust model

Built-in modules ship with the trusted application. Orbit runs no third-party code. A Planet is data: a manifest, declared network hosts and templates. An administrator installs it from a local folder and sees every permission it declares. The host enforces those permissions (egress allowlist, secrets kept out of templates, escaped output). A future tier that runs code needs its own ADR and a sandbox.
