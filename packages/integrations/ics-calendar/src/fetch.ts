import type { EgressFetcher } from '@orbit/application'
import type { CalendarEvent } from '@orbit/domain'
import { MAX_ICS_BYTES, parseIcs, type ParseIcsOptions } from './parse.ts'

const FETCH_TIMEOUT_MS = 15_000

/** Extra egress rules for callers that fetch on behalf of something less trusted, like a Planet. */
export interface IcsEgressOptions {
  readonly allowedHosts?: readonly string[]
  readonly allowPrivate?: boolean
  readonly headers?: Readonly<Record<string, string>>
}

/** The calendar server answered, but not with a calendar. */
export class IcsFetchError extends Error {
  override readonly name = 'IcsFetchError'
}

/**
 * Downloads an ICS feed through the egress guard and parses it. The fetcher is a port, so the
 * private-address rules live in one adapter and cannot be skipped here. `EgressDeniedError`
 * from the fetcher passes through unchanged.
 */
export async function fetchIcsEvents(
  fetcher: EgressFetcher,
  feedUrl: string,
  range: ParseIcsOptions,
  egress: IcsEgressOptions = {},
): Promise<CalendarEvent[]> {
  const response = await fetcher.fetchText({
    url: normalizeFeedUrl(feedUrl),
    maxBytes: MAX_ICS_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    headers: { accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1', ...egress.headers },
    ...(egress.allowedHosts ? { allowedHosts: egress.allowedHosts } : {}),
    ...(egress.allowPrivate === undefined ? {} : { allowPrivate: egress.allowPrivate }),
  })
  if (response.status < 200 || response.status >= 300) {
    throw new IcsFetchError(`The calendar server answered with status ${response.status}.`)
  }
  return parseIcs(response.body, range)
}

/** `webcal://` is how calendar apps share a feed. It means https, or http when no TLS is offered. */
export function normalizeFeedUrl(url: string): string {
  const trimmed = url.trim()
  return /^webcals?:\/\//i.test(trimmed) ? trimmed.replace(/^webcals?:/i, 'https:') : trimmed
}
