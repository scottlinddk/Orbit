# Principles and scope

Orbit is a personal and household dashboard. It is not an IoT hub, a generic website builder, or a replacement for every productivity app.

## Principles

1. **User control.** Users decide where Orbit runs and where data lives.
2. **Small core, composable modules.** Optional capabilities live in modules.
3. **Useful before extensible.** One excellent dashboard before a plugin ecosystem.
4. **Self-hostable first.** Core features work without third-party cloud services. Integrations may need external accounts.
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

Out: IoT, generic automation engine, plugin marketplace, multiple database or identity providers, microservices, RBAC editors, native mobile apps, mandatory AI, hosting or payments.

## Trust model

Built-in modules ship with the trusted application. Third-party code is only run if an administrator deliberately installs it and accepts the risk. A manifest does not imply sandboxing.
