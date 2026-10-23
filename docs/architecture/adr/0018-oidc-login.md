# 0018 OIDC login

Status: accepted

## Context

Households that run Authentik, Authelia or Keycloak expect to sign in to Orbit with them (issue 18). Local accounts ([ADR 0002](0002-local-accounts-auth.md)) stay. This ADR adds one more way to prove who you are. It does not add roles, groups or provisioning.

## Decisions

1. **Authorization code flow with PKCE (S256), `state` and `nonce`.** Endpoints come from `<issuer>/.well-known/openid-configuration`. The discovered `issuer` must equal the configured one exactly, which blocks mix-up attacks.
2. **Configuration is environment variables:** `ORBIT_OIDC_ISSUER`, `ORBIT_OIDC_CLIENT_ID`, `ORBIT_OIDC_CLIENT_SECRET` (all three or none), optional `ORBIT_OIDC_SCOPES` (default `openid profile`; `openid` is always added), `ORBIT_OIDC_BUTTON_LABEL`, and `ORBIT_LOCAL_LOGIN=enabled|disabled` (default `enabled`). The redirect URI to register at the provider is `ORBIT_PUBLIC_URL` + `/api/v1/auth/oidc/callback`. The secret is redacted by `orbit config print`.
3. **ID token verification** uses `jose` (MIT, no dependencies): signature against the provider's JWKS, `iss`, `aud` (and `azp` when there are several audiences), `exp`, `nonce`. Only asymmetric algorithms are accepted, never `HS*` or `none`. Orbit reads identity from the ID token only: it does not call the userinfo endpoint.
4. **Identity mapping.** A table stores `(issuer, subject) -> user`. Orbit **never links by email or username.** Many providers let a user edit or self-assert those, and some do not verify email, so matching on them lets one person take over another's account. The only link is the `sub` claim, which the provider promises is stable and unique.
5. **Who may get a new account through OIDC.** An unknown subject creates a user only if one of these holds, and otherwise the login is refused with the same errors as local registration:
   - the login carries a valid household invitation (the invitation is the permission, as in [ADR 0015](0015-household-invitations.md)),
   - `ORBIT_REGISTRATION=open`,
   - it is the first account on a new instance and the login carries the setup code ([ADR 0002](0002-local-accounts-auth.md) and the setup gate), so a stranger cannot take a fresh server over through the SSO button.
6. **Linking.** A signed-in user can link an OIDC identity to their account. One identity per user per issuer, and one user per identity.
7. **Local accounts** keep working unless `ORBIT_LOCAL_LOGIN=disabled`. Then password login, registration and invitation sign-up with a password are refused (403), because they would create accounts that could never sign in. The `orbit` command line (backup, restore, `create-user`, `reset-password`) is unaffected, so the operator can always recover. Disabling local login requires OIDC to be configured; the configuration check enforces it.
8. **State between redirect and callback** lives in a short-lived (10 minutes) HttpOnly cookie, signed with HMAC-SHA256, holding `state`, `nonce`, the PKCE verifier and the intent (invitation token, setup code, or the user to link). The signing key is derived from `ORBIT_SECRET_KEY` when set, otherwise it is random per process (a restart only invalidates logins in flight). This cookie is `SameSite=Lax`, because the callback is a cross-site navigation from the provider and a `Strict` cookie would not be sent. It is cleared on the callback.
9. **The session cookie stays `SameSite=Strict`.** A `Strict` cookie is not sent on a navigation that began at the provider, and browsers apply that to the redirect chain too. So the callback answers with a small page that sets the session cookie and navigates on by itself (`<meta http-equiv="refresh">`), and that second navigation starts on Orbit's own origin and carries the cookie.
10. **All outbound requests go through the shared egress guard** ([ADR 0003](0003-calendar-integrations.md)): discovery, JWKS and token exchange. Self-hosted providers usually sit on the LAN, so the operator allows their host with `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, per host. Endpoints must be `https`, except when the issuer is `http` and its host is on that list. The egress port gains `POST` with a form body for the token request; a `POST` is never redirected.
11. **Rate limit.** The start and callback routes use the same limit as password login.

## Consequences

- One new table (`external_identities`), one new adapter package (`@orbit/adapter-oidc`), one new runtime dependency (`jose`).
- New public operations: `GET /auth/providers`, `POST /auth/oidc/start`, `GET /auth/oidc/callback`. They are listed in the public-operations check.
- Not covered: group or role mapping from claims, provisioning, logout at the provider (single logout), refresh tokens, and the userinfo endpoint. Each would need its own decision.
- The flow is tested against an in-process fake provider. It has **not** been tested against Authentik, Authelia or Keycloak; `docs/operations/oidc.md` carries the checklist.
