import { z } from 'zod'

export const roleSchema = z.enum(['owner', 'member'])

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
  role: roleSchema.optional(),
})
