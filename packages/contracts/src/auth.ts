import { z } from 'zod'

export const registerRequestSchema = z.strictObject({
  username: z.string().min(3).max(32),
  password: z.string().min(12).max(128),
  displayName: z.string().min(1).max(80).optional(),
})

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
