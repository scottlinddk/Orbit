import { z } from 'zod'

export const connectionKindSchema = z.enum(['homeassistant'])
export const mirrorRoleSchema = z.enum(['calendar', 'todo'])

export const mirrorSchema = z
  .object({
    entityId: z.string(),
    role: mirrorRoleSchema,
    name: z.string(),
  })
  .meta({ id: 'Mirror' })

export const connectionSchema = z
  .object({
    id: z.string(),
    kind: connectionKindSchema,
    name: z.string(),
    /** Only `host[:port]`. The address and the access token are secrets and are never returned. */
    host: z.string(),
    /** The calendars and to-do lists shown in this household. */
    mirrors: z.array(mirrorSchema),
    createdAt: z.string(),
  })
  .meta({ id: 'Connection' })
export type ConnectionResponse = z.infer<typeof connectionSchema>

export const createConnectionRequestSchema = z.strictObject({
  kind: connectionKindSchema,
  name: z.string().min(1).max(80),
  /** Where the other system is reached, for example `http://homeassistant.local:8123`. */
  url: z.string().min(1).max(2000),
  /** A long-lived access token. Orbit keeps it encrypted and never shows it again. */
  token: z.string().min(1).max(4000),
})

export const connectionTestSchema = z
  .object({
    ok: z.boolean(),
    calendars: z.number().int(),
    todoLists: z.number().int(),
    /** Safe to show. Never contains the address or the token. */
    error: z.string().optional(),
  })
  .meta({ id: 'ConnectionTest' })

export const discoveredEntitySchema = z
  .object({
    entityId: z.string(),
    role: mirrorRoleSchema,
    name: z.string(),
    /** Whether this household already shows it. */
    mirrored: z.boolean(),
  })
  .meta({ id: 'DiscoveredEntity' })

export const setMirrorsRequestSchema = z.strictObject({
  /** The complete set to show. Anything not listed stops being shown. */
  entityIds: z.array(z.string().min(1).max(100)).max(50),
})
