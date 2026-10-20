# 0013 Dashboard editor and theming

Status: accepted

## Context

The web UI was plain and had no way to change a widget after adding it. The redesign adds a visual language (pill navigation, large headings, accent cards), an editor in the spirit of the widget editor of the ESP32 e-ink project, and a theme the user can change: fonts, colors, borders.

## Decisions

- **Ordered list plus span stays the layout model.** The ESP32 editor uses `react-grid-layout` with x, y, width and height. Orbit dashboards store an order and a column span, and the grid flows. Moving to x/y would need a data migration and would make small screens harder, since one column is just the order. So the editor drags to reorder (`@dnd-kit`, with keyboard dragging and spoken announcements) and resizes the span. The "Earlier" and "Later" buttons stay, as ADR 0011 required: drag is on top of them, never instead. Heights are not stored. A widget is as tall as its content, and cards in a row share a height.
- **Two new API operations**, `PUT .../widgets/{id}/span` and `PUT .../widgets/{id}/config`, in the existing style of one small idempotent `PUT` per thing. Both are owner-only and covered by the isolation suites.
- **Widgets describe their settings, the editor draws the form.** `WidgetDefinition.options` is a list of `select`, `number`, `toggle` and `text` options. `resolveOptions` applies defaults and validates, so bad saved data never throws. A widget ships no editor UI. A widget can also ask for the accent card (`tone: 'accent'`).
- **Moves are optimistic** and roll back if the server refuses, so a dropped card does not jump back.
- **The theme is data.** A theme is a validated object (`src/theme/schema.ts`): fifteen `#rrggbb` colors, two fonts from a fixed catalog, radius, border width and style, button shape, shadow, density. Applying it sets CSS custom properties on the root, so no component knows about themes. Nothing free-form reaches a style: colors must match `#rrggbb` and fonts must be catalog ids.
- **Stored per browser**, in `localStorage`, versioned (`orbit.theme.v1`). It is applied before React renders, so there is no flash. A theme can be exported and imported as JSON. Opening any page with `?reset-theme` forgets it, in case a theme made the app unreadable. Sharing a theme across a household, or storing it per account, is future work and needs an API.
- **Google Fonts are self-hosted**, through Fontsource, not loaded from Google. The web CSP is `font-src 'self'; style-src 'self'`, and relaxing it would weaken the hardening of ADR 0010. Requests to Google would also send every visitor's IP address to a third party, which is a GDPR problem and breaks offline and air-gapped installs. Only the `latin` and `latin-ext` files of each font are bundled (all of Danish, and most European languages), and a font is fetched only when selected, through the `FontFace` API. The cost is a fixed catalog of 26 fonts instead of all of Google Fonts, and about 2.6 MB in the image.
- **License exception for fonts.** The fonts are SIL OFL 1.1, which `check:licenses` did not allow. OFL permits bundling unmodified fonts in Apache-2.0 software if the notice and license text travel with them. The check now accepts `OFL-1.1` for `@fontsource*` packages only, the build writes `licenses/fonts.txt` next to the app, and `NOTICE` mentions it.
- **Preset colors are tested against WCAG.** Every preset must reach 4.5:1 for text and 3:1 for the lightest part of a gradient. The design this was built from uses white text on a peach gradient end at 2:1, so Ember uses a slightly deeper end color. The editor shows the same checks live.
- **The budget module** (`@orbit/module-budget`) ships four widgets that reproduce the design. Orbit has no finance data source, so they draw deterministic sample data and are marked Preview. Deposit and Withdraw are disabled.

## Consequences

- The main bundle grew by about 30 kB (10 kB gzipped). The editor (51 kB) and the Appearance page load on demand.
- Defaults in `tokens.css` and the Ember preset must match. A test enforces it.
- Adding a font means installing its Fontsource package and regenerating `src/theme/fonts/catalog.ts`.
