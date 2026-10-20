# @orbit/web

The browser app: React 19, Vite, React Router 7, TanStack Query 5. It talks to `@orbit/api` over `/api/v1` and holds no secrets. The session lives in an HttpOnly cookie the browser sends by itself.

## Develop

Run the API and the dev server in two terminals. The API only accepts writes whose `Origin` matches `ORBIT_PUBLIC_URL`, so point it at the Vite address:

```sh
ORBIT_PUBLIC_URL=http://localhost:5173 pnpm --filter @orbit/api start
pnpm --filter @orbit/web dev        # http://localhost:5173, forwards /api to :3000
```

`pnpm --filter @orbit/web build` writes `apps/web/dist`. The Docker image serves that folder from the API, on the same origin.

## Structure

```
src/
  main.tsx          entry
  app/              route table, shell, auth guard, query client
  api/              fetch client (ApiError), query keys, one hooks file per resource
  features/         auth, households, dashboards: pages and their components
  widgets/          registry of module widgets, error boundary
  components/       Button, TextField, Alert, Loading, QueryError
  styles/           tokens.css (colors, spacing, light and dark), global.css
  test/             stubbed API, fixtures, render helper, axe helper
```

Rules of thumb:

- Components never call `fetch`. Data goes through the hooks in `api/`, which validate every response with the schemas from `@orbit/contracts`.
- Colors, spacing and radii come from `styles/tokens.css`. Each component has its own CSS module.
- A request that returns 401 marks the user signed out and sends them to the login page.
- A missing resource and one you may not see look the same (404), so the UI says "not found or no access".

## Tests

`pnpm test` runs component tests in jsdom against a stubbed `fetch`. A request nobody stubbed fails the test. `a11y.test.tsx` runs axe on each page. jsdom has no layout, so color contrast is checked in a real browser, not there.

## Adding a widget

See [`packages/widget-sdk`](../../packages/widget-sdk/README.md). Export a `WidgetDefinition` from your module's `web` entry. It shows up in the picker automatically.
