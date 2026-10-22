import { z } from 'zod'

export const listKindSchema = z.enum(['shopping', 'todo'])

const itemText = z.string().min(1).max(200)
const quantity = z.string().max(40)
const note = z.string().max(500)

export const createListRequestSchema = z.strictObject({
  name: z.string().min(1).max(80),
  kind: listKindSchema,
})

export const renameListRequestSchema = z.strictObject({ name: z.string().min(1).max(80) })

export const addListItemRequestSchema = z.strictObject({
  text: itemText,
  quantity: quantity.optional(),
  note: note.optional(),
})

/** Only the fields present change. `null` or an empty string clears a quantity or a note. */
export const updateListItemRequestSchema = z
  .strictObject({
    text: itemText.optional(),
    done: z.boolean().optional(),
    quantity: quantity.nullable().optional(),
    note: note.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change')

export const moveListItemRequestSchema = z.strictObject({ index: z.int().min(0).max(10_000) })

export const listItemSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    done: z.boolean(),
    quantity: z.string().optional(),
    note: z.string().optional(),
    position: z.number().int(),
    updatedBy: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ListItem' })
export type ListItemResponse = z.infer<typeof listItemSchema>

/** A list with its items in display order. */
export const listSchema = z
  .object({
    id: z.string(),
    householdId: z.string(),
    name: z.string(),
    kind: listKindSchema,
    /** True for a list mirrored from another system: it can be read here, and changed only there. */
    readOnly: z.boolean(),
    /** The kind of system a mirrored list comes from, for example `homeassistant`. */
    source: z.string().optional(),
    /** Mirrored lists: why the last refresh failed. The items are then the last good ones. */
    syncError: z.string().optional(),
    items: z.array(listItemSchema),
  })
  .meta({ id: 'List' })
export type ListResponse = z.infer<typeof listSchema>

export const listSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: listKindSchema,
    readOnly: z.boolean(),
    source: z.string().optional(),
    syncError: z.string().optional(),
    openCount: z.number().int(),
    itemCount: z.number().int(),
  })
  .meta({ id: 'ListSummary' })
export type ListSummaryResponse = z.infer<typeof listSummarySchema>
