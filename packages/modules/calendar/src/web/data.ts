import { createContext } from 'react'

/** One event as the widgets draw it. The app maps the API response into this shape. */
export interface AgendaEvent {
  readonly id: string
  readonly title: string
  readonly location?: string
  /** `#rrggbb` of the calendar it came from, if the owner picked one. */
  readonly color?: string
  /** The name of the calendar, so a color is never the only way to tell calendars apart. */
  readonly calendar?: string
  readonly allDay: boolean
  /** An ISO instant for timed events, `YYYY-MM-DD` for all-day ones. */
  readonly start: string
  /** Same format as `start`. For all-day events the date is exclusive. */
  readonly end: string
}

/**
 * What the calendar widgets know about the household's calendars. The app provides it once per
 * dashboard, so several widgets share one request.
 *
 * - `none`: no calendar is connected (or this dashboard has no way to ask), so widgets show
 *   their empty state.
 */
export type CalendarData =
  | { readonly state: 'none' }
  | { readonly state: 'loading' }
  | { readonly state: 'error' }
  | {
      readonly state: 'ready'
      readonly events: readonly AgendaEvent[]
      /** Names of calendars whose last refresh failed. Their older events are still included. */
      readonly failing: readonly string[]
    }

export const CalendarDataContext = createContext<CalendarData>({ state: 'none' })
