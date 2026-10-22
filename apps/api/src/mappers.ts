import type { ListDetail, ListSummary } from '@orbit/application'
import type {
  CalendarEventResponse,
  CalendarSourceResponse,
  ConnectionResponse,
  DeliveryResponse,
  NotificationEndpointResponse,
  DashboardResponse,
  FeedResponse,
  HouseholdResponse,
  InvitationResponse,
  ListResponse,
  ListSummaryResponse,
} from '@orbit/contracts'
import {
  isReadOnlyList,
  type CalendarSource,
  type Connection,
  type Dashboard,
  type Feed,
  type Household,
  type Invitation,
  type DeliveryLogEntry,
  type NotificationEndpoint,
} from '@orbit/domain'
import type { CalendarEventWithSource } from '@orbit/application'

export const listResponse = ({ list, items, syncError }: ListDetail): ListResponse => ({
  id: list.id,
  householdId: list.householdId,
  name: list.name,
  kind: list.kind,
  readOnly: isReadOnlyList(list),
  ...(list.source === undefined ? {} : { source: list.source.kind }),
  ...(syncError === undefined ? {} : { syncError }),
  items: items.map((i) => ({
    id: i.id,
    text: i.text,
    done: i.done,
    ...(i.quantity === undefined ? {} : { quantity: i.quantity }),
    ...(i.note === undefined ? {} : { note: i.note }),
    position: i.position,
    updatedBy: i.updatedBy,
    updatedAt: i.updatedAt.toISOString(),
  })),
})

export const listSummaryResponse = (s: ListSummary): ListSummaryResponse => ({
  id: s.list.id,
  name: s.list.name,
  kind: s.list.kind,
  readOnly: isReadOnlyList(s.list),
  ...(s.list.source === undefined ? {} : { source: s.list.source.kind }),
  ...(s.syncError === undefined ? {} : { syncError: s.syncError }),
  openCount: s.openCount,
  itemCount: s.itemCount,
})

export const connectionResponse = (c: Connection): ConnectionResponse => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  host: c.host,
  mirrors: c.mirrors.map((m) => ({ entityId: m.entityId, role: m.role, name: m.name })),
  createdAt: c.createdAt.toISOString(),
})

export const householdResponse = (h: Household): HouseholdResponse => ({
  id: h.id,
  name: h.name,
  members: h.members.map((m) => ({ userId: m.userId, role: m.role })),
})

export const dashboardResponse = (d: Dashboard): DashboardResponse => ({
  id: d.id,
  householdId: d.householdId,
  name: d.name,
  columns: d.columns,
  widgets: d.widgets.map((w) => ({ id: w.id, type: w.type, span: w.span, config: w.config })),
})

export const invitationResponse = (i: Invitation): InvitationResponse => ({
  id: i.id,
  role: i.role,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
})

export const feedResponse = (f: Feed): FeedResponse => ({
  id: f.id,
  name: f.name,
  fields: [...f.fields],
  ...(f.dashboardId === undefined ? {} : { dashboardId: f.dashboardId }),
  ...(f.listId === undefined ? {} : { listId: f.listId }),
  createdAt: f.createdAt.toISOString(),
})

export const calendarSourceResponse = (s: CalendarSource): CalendarSourceResponse => ({
  id: s.id,
  name: s.name,
  ...(s.color === undefined ? {} : { color: s.color }),
  host: s.host,
  createdAt: s.createdAt.toISOString(),
})

export const calendarEventResponse = (e: CalendarEventWithSource): CalendarEventResponse => {
  const base = {
    id: e.id,
    sourceId: e.sourceId,
    title: e.title,
    ...(e.location === undefined ? {} : { location: e.location }),
    isRecurring: e.isRecurring,
    isOverride: e.isOverride,
  }
  return e.kind === 'all-day'
    ? { ...base, kind: 'all-day', startDate: e.startDate, endDate: e.endDate }
    : {
        ...base,
        kind: 'timed',
        start: e.start,
        end: e.end,
        ...(e.timeZone === undefined ? {} : { timeZone: e.timeZone }),
      }
}

export const notificationEndpointResponse = (
  e: NotificationEndpoint,
): NotificationEndpointResponse => ({
  id: e.id,
  name: e.name,
  host: e.host,
  events: [...e.events],
  leadMinutes: e.leadMinutes,
  enabled: e.enabled,
  ...(e.disabledReason === undefined ? {} : { disabledReason: e.disabledReason }),
  failures: e.failures,
  createdAt: e.createdAt.toISOString(),
})

export const deliveryResponse = (d: DeliveryLogEntry): DeliveryResponse => ({
  deliveryId: d.deliveryId,
  event: d.event,
  at: d.at.toISOString(),
  attempt: d.attempt,
  outcome: d.outcome,
  ...(d.httpStatus === undefined ? {} : { httpStatus: d.httpStatus }),
  ...(d.error === undefined ? {} : { error: d.error }),
})
