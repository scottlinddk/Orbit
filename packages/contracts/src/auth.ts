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
