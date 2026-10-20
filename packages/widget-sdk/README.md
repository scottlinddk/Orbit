# @orbit/widget-sdk

The contract between widget modules and the web app. A module exports an array of `WidgetDefinition`s from its `web` entry. The app collects them in `apps/web/src/widgets/registry.ts` and renders each placement with the matching definition.

A widget:

- gets its saved `config` and column `span` as props and nothing else. It cannot reach the API client, other widgets or the router.
- should fetch its own data through documented APIs once those exist. Today the built-in widgets need no data.
- must never put credentials in `config`. Integrations keep secrets on the server.
- is rendered inside an error boundary, so a crashing widget does not take the dashboard down.

## Adding a widget

1. Create the component and a `defineWidget({...})` in your module's `src/web/`.
2. Export it from `src/web/index.ts` in the `widgets` array.
3. Add a test next to it.

The widget `type` is `<module>.<widget>`, for example `calendar.today`, and is stored in dashboards. Renaming it orphans existing placements, so treat it as permanent.
