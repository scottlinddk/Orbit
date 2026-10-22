import type { ListDetail, ListSummary } from '@orbit/application'
import type {
  DashboardResponse,
  FeedResponse,
  HouseholdResponse,
  InvitationResponse,
  ListResponse,
  ListSummaryResponse,
} from '@orbit/contracts'
import type { Dashboard, Feed, Household, Invitation } from '@orbit/domain'

export const listResponse = ({ list, items }: ListDetail): ListResponse => ({
  id: list.id,
  householdId: list.householdId,
  name: list.name,
  kind: list.kind,
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
  openCount: s.openCount,
  itemCount: s.itemCount,
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
