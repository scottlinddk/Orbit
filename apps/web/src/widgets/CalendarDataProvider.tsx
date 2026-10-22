import { useMemo, type ReactNode } from 'react'
import type { CalendarEventResponse } from '@orbit/contracts'
import {
  CalendarDataContext,
  type AgendaEvent,
  type CalendarData,
} from '@orbit/module-calendar/web'
import { useCalendarEvents, useCalendarSources } from '../api/calendar.ts'

const toAgendaEvent = (
  e: CalendarEventResponse,
  calendars: ReadonlyMap<string, { name: string; color?: string }>,
): AgendaEvent => {
  const calendar = calendars.get(e.sourceId)
  return {
    id: e.id,
    title: e.title,
    ...(e.location === undefined ? {} : { location: e.location }),
    ...(calendar?.color === undefined ? {} : { color: calendar.color }),
    ...(calendar === undefined ? {} : { calendar: calendar.name }),
    allDay: e.kind === 'all-day',
    start: e.kind === 'all-day' ? e.startDate : e.start,
    end: e.kind === 'all-day' ? e.endDate : e.end,
  }
}

/**
 * Fetches the household's events once and shares them with every calendar widget on the page.
 * Nothing is requested unless the dashboard actually has a calendar widget (`enabled`).
 */
export function CalendarDataProvider({
  householdId,
  enabled,
  children,
}: {
  householdId: string
  enabled: boolean
  children: ReactNode
}) {
  const events = useCalendarEvents(householdId, enabled)
  const sources = useCalendarSources(householdId, enabled)

  const value = useMemo<CalendarData>(() => {
    if (!enabled) return { state: 'none' }
    if (events.isError) return { state: 'error' }
    if (events.isPending || sources.isPending) return { state: 'loading' }
    const calendars = new Map(
      (sources.data ?? []).map((s) => [
        s.id,
        { name: s.name, ...(s.color === undefined ? {} : { color: s.color }) },
      ]),
    )
    // No calendar connected: the widgets say how to connect one instead of showing an empty week.
    if (events.data.sources.length === 0) return { state: 'none' }
    return {
      state: 'ready',
      events: events.data.events.map((e) => toAgendaEvent(e, calendars)),
      failing: events.data.sources
        .filter((s) => !s.ok)
        .map((s) => calendars.get(s.sourceId)?.name ?? 'A calendar'),
    }
  }, [enabled, events.isError, events.isPending, events.data, sources.isPending, sources.data])

  return <CalendarDataContext.Provider value={value}>{children}</CalendarDataContext.Provider>
}
