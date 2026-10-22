/** One place for query keys, so invalidation cannot drift from the queries it targets. */
export const keys = {
  me: ['me'] as const,
  setup: ['setup'] as const,
  households: ['households'] as const,
  household: (id: string) => ['households', id] as const,
  invitations: (householdId: string) => ['households', householdId, 'invitations'] as const,
  invitationPreview: (token: string) => ['invitation-preview', token] as const,
  dashboards: (householdId: string) => ['households', householdId, 'dashboards'] as const,
  dashboard: (id: string) => ['dashboards', id] as const,
  planetWidgets: ['planets', 'widgets'] as const,
  planetRender: (dashboardId: string, widgetId: string) =>
    ['dashboards', dashboardId, 'planet', widgetId] as const,
}
