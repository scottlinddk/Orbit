# 0005 Monorepo layout and enforced dependency rules

Status: accepted

## Decision
pnpm workspaces monorepo: `apps/web`, `apps/api`, `packages/{contracts,domain,application,adapters/*,modules/*,integrations/*,testing}`, `deploy`, `docs`, `tooling`.

Dependency rules from the architecture overview are enforced by dependency-cruiser and ESLint in CI. A violation fails the build.

Each built-in module exposes separate `server` and `web` entries so the SPA never bundles server code.

## Testing
`packages/testing` holds reusable contract suites (run against every adapter, including the in-memory one) and a household-isolation kit that every protected route must pass.
