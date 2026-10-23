# HTTP API

Orbit's web app uses the same HTTP API that you can call yourself. It is described by an OpenAPI 3.0 document that is generated from the code, so it cannot drift from what the server does.

## Where the spec is

- **In the repository:** [`apps/api/openapi.json`](../../apps/api/openapi.json). This is the reference for a given commit or release.
- **From a running instance:** `GET /api/v1/openapi.json`. It needs no sign-in and describes only the shape of the API, no data.

## How it is kept correct

The spec is built from the zod schemas that the routes validate with ([ADR 0004](../architecture/adr/0004-fastify-zod-openapi.md)). `apps/api/src/openapi.test.ts` runs in CI with every change and fails if:

- the generated document differs from the committed `openapi.json`
- an operation lacks a session requirement and is not on the short list of public operations in `apps/api/src/public-operations.ts`
- an operation does not document its 401 or its problem-details errors
- a response mentions a password or token field

After changing a route, regenerate the file and commit it:

```sh
pnpm --filter @orbit/api openapi
```

## Authentication

- **Session cookie.** `POST /api/v1/auth/login` sets `orbit_session` (`__Host-orbit_session` over HTTPS). The cookie is `HttpOnly` and `SameSite=Strict`. There are no API keys and no OAuth tokens for third-party apps yet.
- **Writes** (`POST`, `PUT`, `PATCH`, `DELETE`) from a browser must come from the exact address in `ORBIT_PUBLIC_URL`, or the API answers 403. A script that sends no `Origin` header is not affected. Bodies must be JSON.
- **Feed token.** `GET /api/v1/feed` is authenticated by `Authorization: Bearer <token>` instead of a session, and returns only what its owner allowed ([TRMNL feed](../operations/trmnl-feed.md)).
- **Errors** are RFC 9457 problem details (`application/problem+json`). A resource in a household you do not belong to is reported as 404, never 403, so ids reveal nothing.

For a script, sign in once and reuse the cookie:

```sh
curl -c jar -H 'content-type: application/json' \
  -d '{"username":"alice","password":"..."}' https://orbit.example.com/api/v1/auth/login
curl -b jar https://orbit.example.com/api/v1/households
```

## Versioning policy

- The version is in the path: `/api/v1/...`. A breaking change would get `/api/v2/` and v1 would keep working for a stated period.
- Orbit has not had a 1.0 release. Until then `info.version` in the spec is `0.0.0`, and **the API is not yet a stability promise**. Changes are announced in the release notes, and the regenerated `openapi.json` in a pull request shows exactly what changed.
- What counts as breaking once 1.0 exists: removing or renaming a path, field or enum value, making an optional request field required, narrowing what a request accepts, or changing a response's meaning. Adding an optional field, an operation or an enum value to a response is not breaking, so clients must ignore fields they do not know.

## Not covered

The spec describes the HTTP API only. It does not cover the widget contract ([extending Orbit](../extending/README.md)) or the on-disk Planet format ([Planets](../operations/planets.md)), which have their own versioning.
