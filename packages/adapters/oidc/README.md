# @orbit/adapter-oidc

Implements the `OidcProvider` port ([ADR 0018](../../../docs/architecture/adr/0018-oidc-login.md)): discovery, the authorization code flow with PKCE, the token request, and ID token verification with `jose`.

All requests go through an `EgressFetcher`, so the shared egress guard decides which hosts can be reached. `./testing` exports a fake provider that serves discovery, keys and tokens in process, for tests of this package and of the API.
