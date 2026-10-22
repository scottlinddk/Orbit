import { CalendarFeedError, type CalendarFeedReader } from '@orbit/application'
import { InvariantViolation, type CalendarEvent } from '@orbit/domain'

/**
 * A calendar server for tests. Each address maps to events, or to an error to throw. `calls`
 * counts reads, so tests can prove the cache works.
 */
export class FakeCalendarFeedReader implements CalendarFeedReader {
  readonly feeds = new Map<string, CalendarEvent[] | Error>()
  readonly calls: string[] = []

  parseAddress(input: string) {
    const url = input.trim().replace(/^webcal:/i, 'https:')
    const host = /^https?:\/\/([^/\s?#]+)/i.exec(url)?.[1]
    if (host === undefined || host.includes('@'))
      throw new InvariantViolation('That is not a valid calendar address')
    return { url, host }
  }

  async read(url: string, range: { from: Date; to: Date }): Promise<CalendarEvent[]> {
    this.calls.push(url)
    const feed = this.feeds.get(url)
    if (feed === undefined)
      throw new CalendarFeedError('The calendar server answered with status 404.')
    if (feed instanceof Error) throw feed
    return feed.filter((e) =>
      e.kind === 'all-day'
        ? Date.parse(e.endDate) > range.from.getTime() &&
          Date.parse(e.startDate) < range.to.getTime()
        : Date.parse(e.end) >= range.from.getTime() && Date.parse(e.start) < range.to.getTime(),
    )
  }
}
