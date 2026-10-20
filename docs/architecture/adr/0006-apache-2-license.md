# 0006 Apache-2.0 license

Status: accepted

## Context
Orbit is a self-hosted network service with a planned community module ecosystem, modeled philosophically on Home Assistant (Apache-2.0). AGPL-3.0 was considered because it keeps hosted forks open.

## Decision
Apache-2.0 for the whole repository.

## Rationale
- Lowest friction for module authors and contributors, including corporate ones.
- No ambiguity about whether in-process third-party modules are covered works.
- Explicit patent grant.
- Inbound equals outbound: under section 5, contributions are licensed under Apache-2.0 by default, so no CLA is required.

## Consequences
- Anyone may run a closed, hosted fork. Protecting against that is not a goal for the MVP.
- A future switch to a stricter license would only apply to new versions, and would need contributor consent for their code.
- Contributors are asked to sign off commits (DCO) as a lightweight provenance record. Optional, to be written up in `CONTRIBUTING.md` during scaffolding.
- Dependencies must have licenses compatible with Apache-2.0. CI license checking is added during scaffolding.
