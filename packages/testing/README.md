# @orbit/testing

Shared contract suites and the household-isolation kit.

- `describeRepositoryContracts(name, create)`: behavior every persistence adapter must provide. Call it from the adapter's own test file.
- `describeHouseholdIsolation(name, create)`: the security invariant that one household cannot reach another's resources. Add every new household-scoped use case to it.
- `createInMemorySystem()`: the platform wired with in-memory adapters, for tests.

See [ADR 0007](../../docs/architecture/adr/0007-household-authorization-model.md).
