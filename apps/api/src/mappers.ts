import type {
  CalendarEventResponse,
  CalendarSourceResponse,
  DashboardResponse,
  FeedResponse,
  HouseholdResponse,
  InvitationResponse,
} from '@orbit/contracts'
import type { CalendarSource, Dashboard, Feed, Household, Invitation } from '@orbit/domain'
import type { CalendarEventWithSource } from '@orbit/application'

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
