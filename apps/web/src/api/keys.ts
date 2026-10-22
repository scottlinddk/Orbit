/** One place for query keys, so invalidation cannot drift from the queries it targets. */
export const keys = {
  me: ['me'] as const,
  setup: ['setup'] as const,
  providers: ['auth-providers'] as const,
  households: ['households'] as const,
  household: (id: string) => ['households', id] as const,
  invitations: (householdId: string) => ['households', householdId, 'invitations'] as const,
  invitationPreview: (token: string) => ['invitation-preview', token] as const,
  dashboards: (householdId: string) => ['households', householdId, 'dashboards'] as const,
  dashboard: (id: string) => ['dashboards', id] as const,
  lists: (householdId: string) => ['households', householdId, 'lists'] as const,
  list: (householdId: string, listId: string) =>
    ['households', householdId, 'lists', listId] as const,
  calendarSources: (householdId: string) =>
    ['households', householdId, 'calendar', 'sources'] as const,
  calendarEvents: (householdId: string) =>
    ['households', householdId, 'calendar', 'events'] as const,
  meals: (householdId: string, from: string, to: string) =>
    ['households', householdId, 'meals', from, to] as const,
  mealsAll: (householdId: string) => ['households', householdId, 'meals'] as const,
  recipe: (householdId: string, connectionId: string, recipeRef: string) =>
    ['households', householdId, 'meals', 'recipe', connectionId, recipeRef] as const,
  stock: (householdId: string) => ['households', householdId, 'stock'] as const,
  connections: (householdId: string) => ['households', householdId, 'connections'] as const,
  connectionEntities: (householdId: string, connectionId: string) =>
    ['households', householdId, 'connections', connectionId, 'entities'] as const,
  notificationEndpoints: (householdId: string) =>
    ['households', householdId, 'notifications', 'endpoints'] as const,
  notificationDeliveries: (householdId: string, endpointId: string) =>
    ['households', householdId, 'notifications', 'endpoints', endpointId, 'deliveries'] as const,
  planetWidgets: ['planets', 'widgets'] as const,
  planetRender: (dashboardId: string, widgetId: string) =>
    ['dashboards', dashboardId, 'planet', widgetId] as const,
}
