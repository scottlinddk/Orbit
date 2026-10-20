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

## Settings and look

Give a widget settings by listing `options` in its definition. The editor draws the form and saves the values in the placement's `config`. Read them with `resolveOptions(options, config)`, which returns the saved value when it is valid and the default when it is not:

```ts
const options = [
  { kind: 'select', key: 'period', label: 'Period', choices: [...], default: 'year' },
  { kind: 'number', key: 'rows', label: 'Rows', min: 2, max: 8, default: 4 },
]
const { period, rows } = resolveOptions(options, config)
```

Option keys are stored in dashboards, so treat them like the widget `type`: never rename them.

`tone: 'accent'` asks for the theme's highlight card (a gradient by default). Draw with `currentColor` and translucent tints so it works in every theme. Style with the CSS variables from `apps/web/src/styles/tokens.css` (`--color-surface-2`, `--color-text-muted`, `--radius-sm`, ...), never raw colors. The card is a size container named `widget`, so `@container widget (max-width: 30rem)` adapts a widget to its width.
