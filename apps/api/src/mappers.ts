import type { DashboardResponse, HouseholdResponse, InvitationResponse } from '@orbit/contracts'
import type { Dashboard, Household, Invitation } from '@orbit/domain'

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
