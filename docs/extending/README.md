# Extending Orbit

There are three ways to add something to Orbit. They differ in how much you must trust the author, and in how stable they are today. Read the stability notes before building on one.

| Way                                             | Who can do it                            | Runs code?          | Stability                                                  |
| ----------------------------------------------- | ---------------------------------------- | ------------------- | ---------------------------------------------------------- |
| [A Planet](#a-planet-no-code)                   | Anyone who can write JSON and a template | No, data only       | Manifest `schema_version` 1. Stable by design (ADR 0017)   |
| [A widget module](#a-widget-module-in-the-repo) | A contributor, through a pull request    | Yes, in the web app | `WIDGET_API_VERSION` 1. Stable for the fields documented   |
| [A data source or adapter](#data-sources-today) | A contributor, through a pull request    | Yes, on the server  | **Not stable.** There is no published adapter contract yet |

There is no way to load third-party code at runtime, and no marketplace ([ADR 0017](../architecture/adr/0017-planets-declarative-plugins.md), principle 3).

## A Planet (no code)

A Planet adds a widget from a folder containing `planet.json` and templates. An administrator installs it from a folder on the server. It declares the hosts it may fetch, the secrets it needs and the settings it offers, and Orbit enforces that list. Authoring, the manifest, permissions and install steps are in [Planets](../operations/planets.md). The threat model is in [security model](../architecture/security-model.md).

Choose a Planet when the widget is "fetch some JSON or an ICS feed and show it". It cannot compute anything that a Liquid template cannot.

## A widget module in the repo

A widget is a React component plus a `defineWidget` description. The contract is in [`@orbit/widget-sdk`](../../packages/widget-sdk/README.md). In short:

1. In `packages/modules/<name>/src/web/`, write the component and call `defineWidget({ type: '<name>.<widget>', title, description, defaultSpan, status, options, Component })`.
2. Export an array `widgets` from `src/web/index.ts`.
3. Add the module to the registry in `apps/web/src/widgets/registry.ts`. Two widgets with the same `type` fail at startup.
4. Add a test next to it.

What is permanent: the widget `type` and every option `key`. They are stored in dashboards, so renaming one orphans saved data. What may change: the visual design, the CSS variables, and anything not documented in the SDK README. The dependency rules in `tooling/dependency-cruiser.cjs` stop a module from importing the API client or other modules.

A widget gets its saved `config` and `span` and nothing else. If it needs data from the server, the server side of that data does not exist as a public contract yet, see below.

## Data sources today

[ADR 0003](../architecture/adr/0003-calendar-integrations.md) and the [architecture overview](../architecture/overview.md) describe an `IntegrationProvider` port for calendar sources. **That port is not implemented in code yet.** What exists is honest but narrow:

- **Normalized models** in `packages/domain`: `CalendarEvent` (timed and all-day, one object per occurrence) and `TodoList` / `ListItem`. Sources map their own formats into these so the rest of the app never sees a vendor shape. These are the closest thing to a data-source contract, and they may still change while the first real sources land.
- **An ICS reader** in `packages/integrations/ics-calendar`: `fetchIcsEvents` and `parseIcs`. It does no storage and has no widget wiring yet.
- **Ports a server-side adapter can use** in `packages/application`: `EgressFetcher` for any request to a user-supplied URL (use it, never `fetch`, so private addresses are refused in one place), `SecretStore` for credentials encrypted at rest, and `JobScheduler` for work that runs later.

If you want to add a source, open an issue first. The shape of the port will be decided with the first stored source, and writing against it before then means rewriting it.

## What is not offered

- Loading code from outside the repository at runtime.
- A public package for the widget contract. `@orbit/widget-sdk` is `private` for now. It has the metadata to be published, but its entry point is TypeScript source, which needs a build step first.
- A stable API for third-party apps beyond the [HTTP API](../api/README.md), which has no tokens for outside apps yet.
