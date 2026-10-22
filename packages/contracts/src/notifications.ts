import { z } from 'zod'

export const notificationEventSchema = z
  .enum(['calendar.event.starting', 'list.item.added', 'list.item.completed'])
  .meta({ id: 'NotificationEvent' })
export type NotificationEventName = z.infer<typeof notificationEventSchema>

export const notificationEndpointSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Only the host. The full address is a secret and is never returned. */
    host: z.string(),
    events: z.array(notificationEventSchema),
    /** How long before an event starts `calendar.event.starting` is sent. */
    leadMinutes: z.number().int(),
    enabled: z.boolean(),
    /** Why the endpoint is off, when it is. Safe to show. */
    disabledReason: z.string().optional(),
    /** Deliveries that gave up in a row. */
    failures: z.number().int(),
    createdAt: z.string(),
  })
  .meta({ id: 'NotificationEndpoint' })
export type NotificationEndpointResponse = z.infer<typeof notificationEndpointSchema>

export const createNotificationEndpointRequestSchema = z.strictObject({
  name: z.string().min(1).max(80),
  /** Where deliveries are POSTed. Kept encrypted and never shown again, only its host. */
  url: z.string().min(1).max(2000),
  events: z.array(notificationEventSchema).min(1).max(3),
  /** Minutes before an event starts, 1 to 1440. Defaults to 15. */
  leadMinutes: z.number().int().min(1).max(1440).optional(),
})

export const createdNotificationEndpointSchema = notificationEndpointSchema
  .extend({
    /** Shown this once. Receivers use it to check `X-Orbit-Signature`. */
    signingSecret: z.string(),
  })
  .meta({ id: 'CreatedNotificationEndpoint' })

export const updateNotificationEndpointRequestSchema = z
  .strictObject({
    name: z.string().min(1).max(80).optional(),
    events: z.array(notificationEventSchema).min(1).max(3).optional(),
    leadMinutes: z.number().int().min(1).max(1440).optional(),
    /** Switching an endpoint back on clears its failures. */
    enabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Change at least one field' })

export const deliverySchema = z
  .object({
    deliveryId: z.string(),
    event: z.union([notificationEventSchema, z.literal('notification.test')]),
    at: z.string(),
    attempt: z.number().int(),
    outcome: z.enum(['delivered', 'retrying', 'failed', 'dropped']),
    httpStatus: z.number().int().optional(),
    /** Safe to show. Never contains the address. */
    error: z.string().optional(),
  })
  .meta({ id: 'NotificationDelivery' })
export type DeliveryResponse = z.infer<typeof deliverySchema>
