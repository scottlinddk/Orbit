# Contributing to Orbit

Thanks for helping. Orbit is pre-MVP, so the most valuable contributions right now are feedback on the [scope](docs/product/principles-and-scope.md) and the [architecture](docs/architecture/overview.md).

## Setup

Requirements: Node 22 (see `.nvmrc`) and pnpm (the version is pinned in `package.json`; `corepack enable` installs it).

```sh
pnpm install
pnpm check   # lint, format, typecheck, boundary rules, license check
```

Run the individual steps with `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm check:boundaries` and `pnpm check:licenses`.

## Architecture rules

Dependency direction is enforced in CI by `tooling/dependency-cruiser.cjs`:

- `packages/domain` imports nothing.
- `packages/contracts` imports `zod` only.
- `packages/application` imports `domain` and `contracts` only.
- Adapters, modules and integrations never import each other or the apps.
- `apps/web` imports `contracts` and module `web` entries, never server code.

If a rule blocks you, the design probably needs a new port, not an exception. Open an issue first. See [ADR 0005](docs/architecture/adr/0005-monorepo-and-boundaries.md).

## Pull requests

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
