import { describe, expect, it } from 'vitest'
import { EgressDeniedError, type EgressFetcher, type EgressRequest } from '@orbit/application'
import { fetchIcsEvents, IcsFetchError, normalizeFeedUrl } from './fetch.ts'
import { MAX_ICS_BYTES } from './parse.ts'

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:a@test',
  'DTSTAMP:20260101T000000Z',
  'SUMMARY:Dentist',
  'DTSTART:20260310T130000Z',
  'DTEND:20260310T140000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const range = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z') }

function fakeFetcher(status: number, body: string) {
  const seen: EgressRequest[] = []
  const fetcher: EgressFetcher = {
    fetchText: async (request) => {
      seen.push(request)
      return { status, body, finalUrl: request.url }
    },
  }
  return { fetcher, seen }
}

describe('fetchIcsEvents', () => {
  it('fetches through the port with the size cap and parses the feed', async () => {
    const { fetcher, seen } = fakeFetcher(200, FEED)
    const events = await fetchIcsEvents(fetcher, 'webcal://example.com/family.ics', range)
    expect(events.map((e) => e.title)).toEqual(['Dentist'])
    expect(seen[0]).toMatchObject({
      url: 'https://example.com/family.ics',
      maxBytes: MAX_ICS_BYTES,
    })
  })

  it('reports a non-success status', async () => {
    const { fetcher } = fakeFetcher(404, 'nope')
    await expect(fetchIcsEvents(fetcher, 'https://example.com/a.ics', range)).rejects.toThrow(
      IcsFetchError,
    )
  })

  it('lets a refusal from the egress guard through unchanged', async () => {
    const fetcher: EgressFetcher = {
      fetchText: async () => {
        throw new EgressDeniedError('blocked-address', 'That address is not allowed.')
      },
    }
    await expect(fetchIcsEvents(fetcher, 'http://127.0.0.1/a.ics', range)).rejects.toBeInstanceOf(
      EgressDeniedError,
    )
  })
})

describe('normalizeFeedUrl', () => {
  it('turns webcal into https and leaves other addresses alone', () => {
    expect(normalizeFeedUrl(' webcal://a.test/x.ics ')).toBe('https://a.test/x.ics')
    expect(normalizeFeedUrl('WEBCALS://a.test/x.ics')).toBe('https://a.test/x.ics')
    expect(normalizeFeedUrl('http://a.test/x.ics')).toBe('http://a.test/x.ics')
  })
})
