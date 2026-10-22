/** The only operations that may be called without a session. "<method> <path>" as in OpenAPI. */
export const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'post /api/v1/auth/register',
  'post /api/v1/auth/login',
  'get /api/v1/auth/setup',
  'post /api/v1/invitations/preview',
  'post /api/v1/invitations/accept',
  'post /api/v1/planet-hooks/{token}',
  'get /api/v1/health',
])
