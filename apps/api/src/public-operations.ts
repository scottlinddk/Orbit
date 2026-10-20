/** The only operations that may be called without a session. "<method> <path>" as in OpenAPI. */
export const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set([
  'post /api/v1/auth/register',
  'post /api/v1/auth/login',
])
