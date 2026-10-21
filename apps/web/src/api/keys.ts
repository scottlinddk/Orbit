/** One place for query keys, so invalidation cannot drift from the queries it targets. */
export const keys = {
  me: ['me'] as const,
  setup: ['setup'] as const,
  households: ['households'] as const,
  household: (id: string) => ['households', id] as const,
  dashboards: (householdId: string) => ['households', householdId, 'dashboards'] as const,
  dashboard: (id: string) => ['dashboards', id] as const,
}
