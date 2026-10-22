import type { Dashboard, JsonObject } from './dashboard.ts'
import { invariant } from './errors.ts'
import type { DashboardId, FeedId, HouseholdId, ListId, UserId } from './ids.ts'
import type { Household } from './household.ts'
import { openListItems, type HouseholdList, type HouseholdListItem } from './household-list.ts'

/** A TRMNL plugin must stay under 100 KB in total. One feed may use at most this much of it. */
export const MAX_FEED_BYTES = 64 * 1024

/**
 * The fields a feed can publish. This list is the allowlist: a feed carries exactly the fields
 * its owner picked, and a field that is not registered here cannot be published at all.
 * Widget configuration is deliberately not a field, because it may reference integrations.
 */
/** A feed shows at most this many open items of a list, which keeps it far below the size cap. */
export const MAX_FEED_LIST_ITEMS = 50

export const FEED_FIELDS = [
  'household.name',
  'dashboard.name',
  'dashboard.widgets',
  'list.name',
  'list.items',
] as const
export type FeedField = (typeof FEED_FIELDS)[number]

const DASHBOARD_FIELDS: ReadonlySet<FeedField> = new Set(['dashboard.name', 'dashboard.widgets'])
const LIST_FIELDS: ReadonlySet<FeedField> = new Set(['list.name', 'list.items'])

/**
 * A read-only view of one household's data for a display. The secret token is never part of the
 * domain: only its hash is kept, so a leaked database cannot be used to read a feed.
 */
export interface Feed {
  readonly id: FeedId
  readonly householdId: HouseholdId
  readonly name: string
  readonly fields: readonly FeedField[]
  /** The dashboard the `dashboard.*` fields describe. Required when any of them is chosen. */
  readonly dashboardId?: DashboardId
  /** The list the `list.*` fields describe. Required when any of them is chosen. */
  readonly listId?: ListId
  readonly tokenHash: string
  readonly createdBy: UserId
  readonly createdAt: Date
  readonly revokedAt?: Date
}

export function createFeed(input: {
  id: FeedId
  householdId: HouseholdId
  name: string
  fields: readonly FeedField[]
  dashboardId?: DashboardId | undefined
  listId?: ListId | undefined
  tokenHash: string
  createdBy: UserId
  now: Date
}): Feed {
  const name = input.name.trim()
  invariant(name.length > 0 && name.length <= 80, 'Feed name must be 1 to 80 characters')
  const fields = [...new Set(input.fields)]
  invariant(fields.length > 0, 'Choose at least one field for the feed')
  invariant(
    fields.every((f) => (FEED_FIELDS as readonly string[]).includes(f)),
    'Unknown feed field',
  )
  const needsDashboard = fields.some((f) => DASHBOARD_FIELDS.has(f))
  invariant(
    !needsDashboard || input.dashboardId !== undefined,
    'Choose a dashboard for the dashboard fields',
  )
  const needsList = fields.some((f) => LIST_FIELDS.has(f))
  invariant(!needsList || input.listId !== undefined, 'Choose a list for the list fields')
  return {
    id: input.id,
    householdId: input.householdId,
    name,
    fields,
    ...(needsDashboard && input.dashboardId !== undefined
      ? { dashboardId: input.dashboardId }
      : {}),
    ...(needsList && input.listId !== undefined ? { listId: input.listId } : {}),
    tokenHash: input.tokenHash,
    createdBy: input.createdBy,
    createdAt: input.now,
  }
}

export const isActiveFeed = (feed: Feed) => feed.revokedAt === undefined

/**
 * What the feed publishes right now: only the chosen fields, nothing else. `dashboard` is null
 * when the chosen dashboard no longer exists, so the display shows an empty state rather than
 * the feed failing.
 */
export function renderFeed(
  feed: Feed,
  source: {
    household: Household
    dashboard: Dashboard | undefined
    list?: { list: HouseholdList; items: readonly HouseholdListItem[] } | undefined
  },
): JsonObject {
  const has = (f: FeedField) => feed.fields.includes(f)
  const out: Record<string, JsonObject | null> = {}
  if (has('household.name')) out.household = { name: source.household.name }
  if (feed.dashboardId !== undefined) {
    const { dashboard } = source
    if (!dashboard) out.dashboard = null
    else
      out.dashboard = {
        ...(has('dashboard.name') ? { name: dashboard.name } : {}),
        ...(has('dashboard.widgets')
          ? { widgets: dashboard.widgets.map((w) => ({ type: w.type, span: w.span })) }
          : {}),
      }
  }
  if (feed.listId !== undefined) {
    const { list } = source
    if (!list) out.list = null
    else
      out.list = {
        ...(has('list.name') ? { name: list.list.name } : {}),
        ...(has('list.items')
          ? {
              items: openListItems(list.items)
                .slice(0, MAX_FEED_LIST_ITEMS)
                .map((i) => ({
                  text: i.text,
                  ...(i.quantity === undefined ? {} : { quantity: i.quantity }),
                })),
            }
          : {}),
      }
  }
  return out
}

/** Size of the JSON the feed would send, in UTF-8 bytes. */
export function feedByteLength(content: JsonObject): number {
  let bytes = 0
  for (const char of JSON.stringify(content)) {
    const code = char.codePointAt(0)!
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}
