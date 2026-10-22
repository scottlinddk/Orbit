import {
  feedByteLength,
  isActiveFeed,
  localDate,
  MAX_FEED_BYTES,
  renderFeed,
  type JsonObject,
} from '@orbit/domain'
import type { Clock, SessionTokens } from './auth-ports.ts'
import type { CalendarService } from './calendar.ts'
import type { ExternalKitchen } from './connections.ts'
import { FeedTooLargeError, NotFoundError } from './errors.ts'
import type {
  DashboardRepository,
  FeedRepository,
  HouseholdRepository,
  ListRepository,
} from './ports.ts'

export interface FeedReaderDependencies {
  feeds: FeedRepository
  households: HouseholdRepository
  dashboards: DashboardRepository
  lists: ListRepository
  tokens: Pick<SessionTokens, 'hash'>
  /** Defaults to MAX_FEED_BYTES; tests lower it. */
  maxFeedBytes?: number
  /** Where `calendar.*` fields get their events. Without it those fields are empty. */
  calendar?: Pick<CalendarService, 'cachedEventsForFeed'> | undefined
  /** Where `meals.*` and `stock.*` fields get their data. Without it those fields are empty. */
  kitchen?: ExternalKitchen | undefined
  clock?: Clock | undefined
  /** The zone that decides what "today" means. Defaults to UTC. */
  timeZone?: string | undefined
}

export type FeedReader = ReturnType<typeof createFeedReader>

/**
 * The feed token is its own kind of caller. It has no user and no session, so it never goes
 * through the household `Authorizer`: the token is resolved to exactly one feed, and that
 * feed's own household and dashboard are the only things it can read. Everything that is wrong
 * with a token (missing, malformed, unknown, revoked) is the same NotFoundError.
 */
export function createFeedReader(deps: FeedReaderDependencies) {
  const { feeds, households, dashboards, lists, tokens } = deps
  const maxFeedBytes = deps.maxFeedBytes ?? MAX_FEED_BYTES
  return {
    async read(token: string): Promise<JsonObject> {
      if (token.length === 0 || token.length > 256) throw new NotFoundError()
      const feed = await feeds.findByTokenHash(tokens.hash(token))
      if (!feed || !isActiveFeed(feed)) throw new NotFoundError()
      const household = await households.get(feed.householdId)
      if (!household) throw new NotFoundError()
      const dashboard =
        feed.dashboardId === undefined ? undefined : await dashboards.get(feed.dashboardId)
      // Belt and braces: a dashboard from another household is never published.
      const own = dashboard?.householdId === feed.householdId ? dashboard : undefined
      const list = feed.listId === undefined ? undefined : await lists.getList(feed.listId)
      // Same belt and braces for a list.
      const ownList =
        list?.householdId === feed.householdId
          ? { list, items: await lists.items(list.id) }
          : undefined
      const wantsCalendar = feed.fields.some((f) => f.startsWith('calendar.'))
      const calendar =
        wantsCalendar && deps.calendar
          ? {
              events: await deps.calendar.cachedEventsForFeed(feed.householdId),
              now: (deps.clock ?? { now: () => new Date() }).now(),
              timeZone: deps.timeZone ?? 'UTC',
            }
          : undefined
      const now = (deps.clock ?? { now: () => new Date() }).now()
      const meals =
        feed.fields.includes('meals.today') && deps.kitchen
          ? {
              today: localDate(now, deps.timeZone ?? 'UTC'),
              entries: await deps.kitchen.cachedMeals(
                feed.householdId,
                localDate(now, deps.timeZone ?? 'UTC'),
              ),
            }
          : undefined
      const stock =
        feed.fields.includes('stock.expiring') && deps.kitchen
          ? { items: await deps.kitchen.cachedStock(feed.householdId) }
          : undefined
      const content = renderFeed(feed, {
        household,
        dashboard: own,
        list: ownList,
        calendar,
        meals,
        stock,
      })
      if (feedByteLength(content) > maxFeedBytes) throw new FeedTooLargeError()
      return content
    },
  }
}
