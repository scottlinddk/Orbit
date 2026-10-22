import { z } from 'zod'

export const registerRequestSchema = z.strictObject({
  username: z.string().min(3).max(32),
  password: z.string().min(12).max(128),
  displayName: z.string().min(1).max(80).optional(),
  /** Needed only for the first account, while GET /auth/setup says so. */
  setupCode: z.string().min(1).max(64).optional(),
})

export const setupStatusSchema = z
  .object({ setupCodeRequired: z.boolean() })
  .meta({ id: 'SetupStatus' })
export type SetupStatus = z.infer<typeof setupStatusSchema>

export const loginRequestSchema = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

export const sessionUserSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
  })
  .meta({ id: 'User' })
export type SessionUser = z.infer<typeof sessionUserSchema>

export const authProvidersSchema = z
  .object({
    /** False when the operator turned password sign-in off (ORBIT_LOCAL_LOGIN=disabled). */
    local: z.boolean(),
    /** The single-sign-on button, or null when no provider is configured. */
    oidc: z.object({ label: z.string() }).nullable(),
  })
  .meta({ id: 'AuthProviders' })
export type AuthProviders = z.infer<typeof authProvidersSchema>

export const oidcStartRequestSchema = z.strictObject({
  /** Join a household with this invitation while signing in. */
  inviteToken: z.string().min(1).max(200).optional(),
  /** The setup code, for the very first account on a new instance. */
  setupCode: z.string().min(1).max(64).optional(),
  /** Link the provider account to the signed-in user instead of signing in. */
  link: z.boolean().optional(),
})

export const oidcStartResponseSchema = z
  .object({ authorizationUrl: z.url() })
  .meta({ id: 'OidcStart' })
export type OidcStart = z.infer<typeof oidcStartResponseSchema>
