import {
  feedByteLength,
  isActiveFeed,
  MAX_FEED_BYTES,
  renderFeed,
  type JsonObject,
} from '@orbit/domain'
import type { SessionTokens } from './auth-ports.ts'
import { FeedTooLargeError, NotFoundError } from './errors.ts'
import type { DashboardRepository, FeedRepository, HouseholdRepository } from './ports.ts'

export interface FeedReaderDependencies {
  feeds: FeedRepository
  households: HouseholdRepository
  dashboards: DashboardRepository
  tokens: Pick<SessionTokens, 'hash'>
  /** Defaults to MAX_FEED_BYTES; tests lower it. */
  maxFeedBytes?: number
}

export type FeedReader = ReturnType<typeof createFeedReader>

/**
 * The feed token is its own kind of caller. It has no user and no session, so it never goes
 * through the household `Authorizer`: the token is resolved to exactly one feed, and that
 * feed's own household and dashboard are the only things it can read. Everything that is wrong
 * with a token (missing, malformed, unknown, revoked) is the same NotFoundError.
 */
export function createFeedReader(deps: FeedReaderDependencies) {
  const { feeds, households, dashboards, tokens } = deps
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
      const content = renderFeed(feed, { household, dashboard: own })
      if (feedByteLength(content) > maxFeedBytes) throw new FeedTooLargeError()
      return content
    },
  }
}
