import type {
  DashboardResponse,
  FeedResponse,
  HouseholdResponse,
  InvitationResponse,
} from '@orbit/contracts'
import type { Dashboard, Feed, Household, Invitation } from '@orbit/domain'

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
