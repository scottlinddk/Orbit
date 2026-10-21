# @orbit/module-lists

Built-in shopping and household lists module.

The source-neutral model is `TodoList` and `ListItem` in `@orbit/domain` (`packages/domain/src/list.ts`), with `sortedItems` for display order. A source adapter, such as the Home Assistant `todo.*` one (#16), maps its own format into those shapes. Whether Orbit also gets its own native list store is still undecided (#13), and this model does not assume it.

The shopping widget is still a preview with no data.

See [architecture overview](../../../docs/architecture/overview.md) for the dependency rules this package must follow.
