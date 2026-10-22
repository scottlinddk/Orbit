# @orbit/adapter-planets-sqlite

Stores what a Planet last fetched (so a failed refresh keeps the last good data) and the hashed tokens of its webhook URLs. The tables come from migration 4 in `@orbit/adapter-persistence-sqlite`.

See [architecture overview](../../../docs/architecture/overview.md) for the dependency rules this package must follow.
