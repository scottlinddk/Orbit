# Sign in with OpenID Connect

Orbit can let people sign in with an identity provider you already run, such as Authentik, Authelia or Keycloak. Local accounts keep working unless you turn them off. Design notes and the reasons behind each choice are in [ADR 0018](../architecture/adr/0018-oidc-login.md).

**Status.** The flow is tested against an in-process stand-in for a provider (`packages/adapters/oidc`), which really signs tokens and checks PKCE, state, nonce, audience, issuer, expiry and keys. It has **not** been tested against Authentik, Authelia or Keycloak. The provider settings below follow each product's documentation and are marked untested. See the checklist at the end.

## What you need

1. A provider that supports OpenID Connect discovery (`<issuer>/.well-known/openid-configuration`), the authorization code flow and PKCE with `S256`.
2. A client (application) at the provider of type **confidential** (it has a secret), with this redirect URI, exactly:

   ```
   <ORBIT_PUBLIC_URL>/api/v1/auth/oidc/callback
   ```

   For example `https://orbit.example.com/api/v1/auth/oidc/callback`. Orbit prints it in the log at start, and `orbit config print --redacted` shows it as `oidc.redirectUri`.

3. Scopes `openid` and `profile`. Orbit uses the `name` or `preferred_username` claim only as a display name for a new user.

## Settings

| Variable                                 | Meaning                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ORBIT_OIDC_ISSUER`                      | The issuer, exactly as the provider names itself (it must equal the `iss` of its tokens). Often ends in `/`. |
| `ORBIT_OIDC_CLIENT_ID`, `_CLIENT_SECRET` | From the client you created. All three settings, or none.                                                    |
| `ORBIT_OIDC_SCOPES`                      | Default `openid profile`. `openid` is always added.                                                          |
| `ORBIT_OIDC_BUTTON_LABEL`                | Text after "Sign in with". Default `Single sign-on`.                                                         |
| `ORBIT_LOCAL_LOGIN`                      | `enabled` (default) or `disabled`. See below.                                                                |
| `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`       | Needed when the provider sits on your LAN: list its host name. Per host, never everything.                   |

Orbit asks the provider for its endpoints and keys through the same guarded outbound path as calendar feeds. A name that resolves to a private address is refused unless you list the host. Endpoints must be `https`. The one exception is a provider whose issuer is `http://` **and** whose host is in `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS`, for a LAN-only setup without certificates. Prefer https.

With Docker, put the settings in `.env` and run `docker compose up -d`. Check them with `docker compose exec orbit orbit config validate`.

## Who gets an account

Orbit identifies a person by the provider's `sub` claim together with the issuer. It **never** matches on email address or username, because many providers let people change those, and some do not verify email: matching on them would let one person sign in as another.

A person who signs in with an unknown identity gets a new account only if:

- they come with a **household invitation** (the join page has a "Join with …" button), or
- `ORBIT_REGISTRATION=open`, or
- this is the **first account** on a new instance and they give the **setup code** (the sign-in page asks for it).

Otherwise they are refused and sent back to the sign-in page. To bring an existing person over, they sign in with their password and press **Link …** in the page header. After that they can sign in either way. One provider account links to one Orbit account, and an Orbit account has one identity per provider.

## Turning passwords off

`ORBIT_LOCAL_LOGIN=disabled` removes password sign-in, registration and password sign-up by invitation (they answer 403), and hides the password form. Orbit refuses to start with this setting unless OIDC is configured. Make sure at least one owner has linked an identity **before** you switch it, or nobody can sign in. The `orbit` command line (`backup`, `restore`, `create-user`, `reset-password`) still works, so you can always recover from the server. Setting it back to `enabled` brings passwords back.

## Provider examples (untested against the real provider)

Names of fields differ between versions. Check the provider's own documentation for yours.

### Authentik

Create a **Provider** of type OAuth2/OpenID with client type **Confidential**, the redirect URI above (strict matching), a signing key set (so tokens are signed with an asymmetric key, not HS256), and scopes `openid` and `profile`. Attach it to an **Application** with the slug `orbit`.

```sh
ORBIT_OIDC_ISSUER=https://auth.example.com/application/o/orbit/
ORBIT_OIDC_CLIENT_ID=<client id from the provider>
ORBIT_OIDC_CLIENT_SECRET=<client secret>
ORBIT_OIDC_BUTTON_LABEL=Authentik
```

### Authelia

Add a client under `identity_providers.oidc.clients` with `public: false`, `redirect_uris` containing the address above, `scopes: [openid, profile]`, `grant_types: [authorization_code]`, `token_endpoint_auth_method: client_secret_basic`, and `require_pkce: true` with `pkce_challenge_method: S256`. Authelia stores the secret hashed: give Orbit the plain secret and put its hash in Authelia's configuration.

```sh
ORBIT_OIDC_ISSUER=https://auth.example.com
ORBIT_OIDC_CLIENT_ID=orbit
ORBIT_OIDC_CLIENT_SECRET=<the plain secret>
ORBIT_OIDC_BUTTON_LABEL=Authelia
```

### Keycloak

In a realm, create a client with **Client authentication** on, only **Standard flow** enabled, the valid redirect URI above, and PKCE method `S256` under Advanced settings. Copy the secret from the Credentials tab.

```sh
ORBIT_OIDC_ISSUER=https://keycloak.example.com/realms/home
ORBIT_OIDC_CLIENT_ID=orbit
ORBIT_OIDC_CLIENT_SECRET=<client secret>
ORBIT_OIDC_BUTTON_LABEL=Keycloak
```

## Troubleshooting

The sign-in page shows a short reason after a failure. The server log has the detail (`oidc sign-in failed` with a `reason`), and never contains secrets, codes or tokens.

| Page says                             | Usually                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "did not work" (`failed`)             | Wrong client secret, a redirect URI that does not match exactly, a clock more than a minute off, or an issuer that differs from the `iss` in the tokens (trailing slash). |
| "took too long" (`expired`)           | More than ten minutes between pressing the button and returning, or the callback opened in another browser.                                                               |
| "does not create accounts" (`closed`) | The person has no account, no invitation, and registration is closed. Invite them, or have them link first.                                                               |
| 502 when pressing the button          | Orbit cannot reach the provider. Check the address, and `ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS` for a LAN host.                                                                |

## Checklist for a real provider (open)

For each of Authentik, Authelia and Keycloak:

- [ ] The first owner is created with the setup code through the button.
- [ ] An existing password user links the provider account and signs in with it afterwards.
- [ ] An invited person joins a household with the button.
- [ ] A stranger without an invitation is refused when registration is closed.
- [ ] The session cookie is set and the person stays signed in after the redirect (`SameSite=Strict` cookie, see ADR 0018).
- [ ] `ORBIT_LOCAL_LOGIN=disabled` leaves only the button, and `orbit reset-password` still works from the server.
