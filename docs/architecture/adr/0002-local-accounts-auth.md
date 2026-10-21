# 0002 Local accounts for authentication

Status: accepted

## Decision

Email or username plus password, hashed with argon2id, server-side sessions in an HttpOnly, SameSite cookie. The first user becomes the instance owner. Household invites are explicit.

## Requirements

- Rate limiting and lockout backoff on login.
- CSRF protection for cookie-authenticated mutations.
- Authorization is platform-owned and independent of how identity is established, so OIDC can be added as another identity adapter later.

## Consequences

No password reset by email unless SMTP is configured. MVP provides an owner-run CLI reset command instead.

## Update

Implementation details, the password policy, registration policy and CSRF design are in [ADR 0010](0010-sessions-and-http-hardening.md). Registration is closed after the first account by default. The "owner-run CLI reset command" is not built yet.

## Update: first-run setup code

Choosing "the first user becomes the owner" left a window on a public install: between starting the server and the owner registering, anyone could register and take it over. While no account exists and registration is `first-user-only`, the first registration now also needs a one-time setup code.

- Options weighed: (a) a code printed in the server log, (b) create the owner only with the operator CLI, (c) documentation only. (a) was chosen. (b) stays available as `orbit create-user`. (c) relies on people reading a page.
- The code is 12 random symbols from an alphabet without look-alike characters (about 59 bits), generated at each start while no owner exists, held only as a SHA-256 digest in memory, compared in constant time, and discarded when an owner exists. Nothing is written to the database, so there is no migration. `ORBIT_SETUP_CODE` lets the operator choose it instead.
- It is checked before the password is hashed, and registration is already rate limited. `GET /api/v1/auth/setup` tells the web app whether to ask for it. That reveals only that the instance has no owner yet, which a registration attempt would reveal anyway.
- Trade-off: the operator needs log access once. A code that is lost is replaced by restarting.
