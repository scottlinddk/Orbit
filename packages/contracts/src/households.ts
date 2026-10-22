import { z } from 'zod'

export const roleSchema = z.enum(['owner', 'member', 'child', 'device'])
/** Roles that can be handed out after the household exists. Owners are never invited. */
export const invitableRoleSchema = z.enum(['member', 'child', 'device'])

export const householdSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    members: z.array(z.object({ userId: z.string(), role: roleSchema })),
  })
  .meta({ id: 'Household' })
export type HouseholdResponse = z.infer<typeof householdSchema>

export const createHouseholdRequestSchema = z.strictObject({ name: z.string().min(1).max(80) })

export const addMemberRequestSchema = z.strictObject({
  username: z.string().min(1).max(64),
  role: invitableRoleSchema.optional(),
})

export const changeMemberRoleRequestSchema = z.strictObject({ role: roleSchema })

export const createInvitationRequestSchema = z.strictObject({
  role: invitableRoleSchema.optional(),
  /** How long the link works. Defaults to 7 days on the server. */
  expiresInDays: z.int().min(1).max(30).optional(),
})

export const invitationSchema = z
  .object({
    id: z.string(),
    role: roleSchema,
    createdAt: z.string(),
    expiresAt: z.string(),
  })
  .meta({ id: 'Invitation' })
export type InvitationResponse = z.infer<typeof invitationSchema>

/** The only response that carries the secret. It is not stored and cannot be shown again. */
export const createdInvitationSchema = invitationSchema
  .extend({ token: z.string() })
  .meta({ id: 'CreatedInvitation' })
export type CreatedInvitationResponse = z.infer<typeof createdInvitationSchema>

export const invitationTokenRequestSchema = z.strictObject({ token: z.string().min(1).max(128) })

export const invitationPreviewSchema = z
  .object({ householdName: z.string(), role: roleSchema })
  .meta({ id: 'InvitationPreview' })
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>

export const acceptInvitationRequestSchema = z.strictObject({
  token: z.string().min(1).max(128),
  username: z.string().min(3).max(32),
  password: z.string().min(12).max(128),
  displayName: z.string().min(1).max(80).optional(),
})
