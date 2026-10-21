# 0010 Sessions and HTTP hardening

Status: accepted

## Context

ADR 0002 chose local accounts with server-side sessions. This records how they work and what the HTTP layer enforces, because most web vulnerabilities live here rather than in the domain.

## Decisions

**Accounts**

- Argon2id (`@node-rs/argon2`, OWASP minimum profile: 19 MiB, 2 iterations, 1 lane), salted per hash, parameters stored in the hash. Prebuilt binaries cover Linux x64 and arm64 (glibc and musl), macOS and Windows. A pure-JS or `node:crypto` scrypt fallback is possible if a platform lacks a binary.
- Passwords are 12 to 128 characters. No composition rules (NIST 800-63B). There is no breached-password check yet because it needs a network or a large local list.
- Usernames are lowercase, 3 to 32 characters, unique case-insensitively.
- Login answers identically for a wrong password, an unknown user and a malformed username, and spends the same hashing time for all three (a decoy hash), so neither the response nor its timing reveals which usernames exist.
- `ORBIT_REGISTRATION=first-user-only` (default) lets the first account register and then closes. It answers "closed" before "taken", so a closed instance reveals no usernames. `open` is for private networks. Owners invite people with a link ([ADR 0015](0015-household-invitations.md)), which works while registration is closed. An owner can also add an existing account by username.

**Sessions**

- 256-bit random token in a cookie. Only its SHA-256 is stored, so a leaked database cannot be used to sign in.
- Fixed 14-day lifetime (no sliding window), new token on every login, deleted on logout, purged hourly.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`. Over HTTPS (`ORBIT_PUBLIC_URL` starts with `https:`) it is also `Secure` and named `__Host-orbit_session`, which browsers refuse to accept from sibling subdomains.

**CSRF** has three independent layers: `SameSite=Strict`; JSON-only bodies (every other content type is a 415, including `text/plain`, which Fastify would otherwise accept); and an `Origin` check on every non-GET request that rejects any origin other than `ORBIT_PUBLIC_URL`. Requests with no `Origin` (curl, scripts) cannot be CSRF and pass.

**Other**

- Per-IP rate limits: 10 per minute on register and login, 300 per minute elsewhere. Behind a reverse proxy set `ORBIT_TRUST_PROXY=true`, otherwise every client shares the proxy's address.
- 64 KiB body limit, 128-character path ids, widget settings limited to plain JSON up to 8 levels deep and 1000 nodes.
- Strict request schemas reject unknown fields, so a client cannot set fields it should not control.
- All errors are RFC 9457 problem details. Unrecognized errors become a generic 500, with details only in the server log. Validation errors name the failing field but never echo submitted values.
- Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a restrictive CSP and `X-Request-Id`.
- Logs redact cookies and authorization headers. Request bodies are never logged. A test checks that passwords and session tokens do not appear in logs.

## Known limits

- Rate limiting is per IP and in memory. It resets on restart and does not stop a distributed attack on one username. Account lockout is not implemented.
- No password change, no "sign out everywhere", no email recovery. The owner can reset through the database until a CLI exists.
- No TLS in the app. Run it behind a reverse proxy that terminates HTTPS and set `ORBIT_PUBLIC_URL` to the public https address.
- A reverse proxy that serves Orbit under a different hostname than `ORBIT_PUBLIC_URL` gets 403 on writes by design.

## Testing

HTTP tests cover each property above, and the household-isolation kit runs again through HTTP (`apps/api/src/isolation.http.test.ts`). It fails if a protected route is added to the OpenAPI document without an isolation case. The suite was mutation-checked: removing the origin check, the auth hook, `SameSite`, the JSON-only rule, session expiry or the uniform login error each fails tests.
