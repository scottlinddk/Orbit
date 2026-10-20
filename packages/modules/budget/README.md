# @orbit/module-budget

Built-in household budget module. It ships four widgets that make up a spending overview:

| Type                  | Shows                                         | Settings               |
| --------------------- | --------------------------------------------- | ---------------------- |
| `budget.overview`     | Monthly spending as a bar chart (accent card) | period, currency       |
| `budget.cards`        | Card balance and limit (accent card)          | currency               |
| `budget.transactions` | The latest transactions                       | rows to show, currency |
| `budget.categories`   | Spending per category, with the change        | categories, currency   |

All four are `preview` widgets. Orbit has no bank or budget data source yet, so they draw deterministic sample data from `src/web/sampleData.ts`. The dashboard labels them "Preview". When a real source exists, replace the sample functions and keep the widget types and option keys, because both are stored in dashboards.

The module never receives credentials in widget `config`. A future data source keeps its secrets on the server.

See [architecture overview](../../../docs/architecture/overview.md) for the dependency rules this package must follow.
