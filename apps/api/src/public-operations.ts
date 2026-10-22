/** The only operations that may be called without a session. "<method> <path>" as in OpenAPI. */
export const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'post /api/v1/auth/register',
  'post /api/v1/auth/login',
  'get /api/v1/auth/setup',
  'get /api/v1/auth/providers',
  // Starting needs a session only to link an account. The callback is the provider's redirect.
  'post /api/v1/auth/oidc/start',
  'get /api/v1/auth/oidc/callback',
  'post /api/v1/invitations/preview',
  'post /api/v1/invitations/accept',
  'post /api/v1/planet-hooks/{token}',
  'get /api/v1/health',
  // Authenticated by a feed token, not a session. See ADR 0016.
  'get /api/v1/feed',
])
