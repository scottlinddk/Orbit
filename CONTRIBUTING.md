# Contributing to Orbit

Thanks for helping. Orbit is pre-MVP, so the most valuable contributions right now are feedback on the [scope](docs/product/principles-and-scope.md) and the [architecture](docs/architecture/overview.md).

## Setup

Requirements: Node 22.18 or later (see `.nvmrc`) and pnpm (the version is pinned in `package.json`; `corepack enable` installs it).

```sh
pnpm install
pnpm check   # lint, format, typecheck, tests, boundary rules, license check
```

Run the individual steps with `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm check:boundaries` and `pnpm check:licenses`.

## Architecture rules

Dependency direction is enforced in CI by `tooling/dependency-cruiser.cjs`:

- `packages/domain` imports nothing.
- `packages/contracts` imports `zod` only.
- `packages/application` imports `domain` and `contracts` only.
- Adapters, modules and integrations never import each other or the apps.
- `apps/web` imports `contracts` and module `web` entries, never server code.

If a rule blocks you, the design probably needs a new port, not an exception. Open an issue first. See [ADR 0005](docs/architecture/adr/0005-monorepo-and-boundaries.md).

## Pull requests

- Every household-scoped use case must be added to the isolation kit in `packages/testing/src/isolation-kit.ts`, and every new route to `apps/api/src/isolation.http.test.ts` (a test fails if you forget). After route or schema changes run `pnpm --filter @orbit/api openapi` and commit `apps/api/openapi.json`. See [ADR 0007](docs/architecture/adr/0007-household-authorization-model.md).
- New widgets follow [`packages/widget-sdk`](packages/widget-sdk/README.md) and need a test. UI changes need a component test and must keep `a11y.test.tsx` green.
- Browser tests live in `e2e/`. Run them with `pnpm build && pnpm --filter @orbit/e2e test`. They start the API and the built web app themselves. Deployment changes must keep `deploy/smoke-test.sh` green (CI runs it).
- Keep PRs focused. Docs and ADR changes are welcome on their own.
- New decisions that affect structure, security or data handling need an ADR in `docs/architecture/adr/`.
- Do not add dependencies with licenses outside the allowlist in `tooling/check-licenses.mjs`.
- Never commit secrets or real personal data. Use `.env.example` for configuration examples.

## License and sign-off

Orbit is licensed under [Apache-2.0](LICENSE). By contributing you agree your contribution is licensed under it (Apache-2.0 section 5).

We ask that commits carry a [Developer Certificate of Origin](https://developercertificate.org/) sign-off:

```sh
git commit -s
```

This is a lightweight provenance record, not a CLA.
