# 0011 Web UI

Status: accepted

## Decisions

- **Stack:** React 19, Vite, TypeScript, React Router 7 (library mode, `createBrowserRouter`) and TanStack Query 5. Router 8 exists but v7 matches the team's experience and nothing here needs v8.
- **Data:** all server state lives in TanStack Query. Components use hooks from `src/api`. Every response is parsed with the zod schemas from `@orbit/contracts`, so a server and client that drift fail loudly in one place. Mutations put the server's returned dashboard or household into the cache instead of guessing.
- **Styling:** CSS Modules per component and one `tokens.css` of variables with light and dark themes. No UI library and no utility CSS, to keep the dependency surface and bundle small.
- **Widgets:** modules export `WidgetDefinition`s through `@orbit/widget-sdk`. A widget receives only `config` and `span`, runs inside an error boundary, and unknown widget types stay on the dashboard with an explanation. The three shipped widgets are `calendar.today` (real, needs no data) and two clearly labelled previews.
- **Reordering** uses "Earlier" and "Later" buttons with a live-region announcement. It is keyboard and screen-reader complete. Drag and drop can be added on top later, never instead.
- **Layout** uses a CSS grid driven by the dashboard's column count and each widget's span. Below 40rem it is one column, whatever the spans.
- **Auth in the browser:** the HttpOnly session cookie is invisible to scripts. Any 401 clears the cached user and routes to login. The post-login return path accepts same-site paths only.
- **Language:** English only for now. Dates and weekday names use the browser's locale. Translations are future work.

## Consequences

- Production serves the built app from the API on one origin, which keeps cookies `SameSite=Strict` and the Origin check simple (Docker work). In development the Vite proxy is cross-port, so the API must be started with `ORBIT_PUBLIC_URL=http://localhost:5173`.
- Household members appear as "You" and "Member N" because the API does not return display names yet.
- The production bundle is about 460 kB (141 kB gzipped), mostly React and zod. Splitting is not worth doing yet.
