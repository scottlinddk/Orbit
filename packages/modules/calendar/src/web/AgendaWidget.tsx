import { useContext } from 'react'
import { defineWidget, resolveOptions, type WidgetProps } from '@orbit/widget-sdk'
import { dayLabel, groupByDay, timeLabel, type DayGroup } from './agenda.ts'
import { CalendarDataContext } from './data.ts'

const MAX_EVENTS = 30

const options = [
  {
    key: 'days',
    kind: 'number',
    label: 'Days to show',
    help: 'From today.',
    min: 1,
    max: 14,
    step: 1,
    default: 7,
  },
] as const

/** Keeps the first `limit` events across all days, so a very busy week stays readable. */
function capEvents(groups: readonly DayGroup[], limit: number): DayGroup[] {
  const capped: DayGroup[] = []
  let left = limit
  for (const group of groups) {
    if (left <= 0) break
    const events = group.events.slice(0, left)
    left -= events.length
    capped.push({ day: group.day, events })
  }
  return capped
}

function Agenda({ config }: WidgetProps) {
  const data = useContext(CalendarDataContext)
  const days = Number(resolveOptions(options, config).days)
  const locale = typeof config.locale === 'string' ? config.locale : undefined

  if (data.state === 'loading') return <p style={{ margin: 0 }}>Loading events…</p>
  if (data.state === 'error')
    return (
      <p role="alert" style={{ margin: 0 }}>
        The calendar could not be loaded.
      </p>
    )
  if (data.state === 'none')
    return (
      <p style={{ margin: 0 }}>
        Connect a calendar to see this week’s events here. An owner can add an ICS link on the
        household page.
      </p>
    )

  const groups = capEvents(groupByDay(data.events, new Date(), days), MAX_EVENTS)
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {data.failing.length > 0 ? (
        <p role="status" style={{ margin: 0, opacity: 0.8 }}>
          {data.failing.join(', ')} could not be refreshed. Showing the last events we have.
        </p>
      ) : null}
      {groups.length === 0 ? <p style={{ margin: 0 }}>Nothing planned.</p> : null}
      {groups.map((group) => {
        const shown = group.events
        return (
          <section key={group.day} aria-label={dayLabel(group.day, locale)}>
            <h3
              style={{
                margin: '0 0 0.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {dayLabel(group.day, locale)}
            </h3>
            <ul
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.25rem' }}
            >
              {shown.map((event) => (
                <li
                  key={`${event.id}@${group.day}`}
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}
                >
                  <span
                    aria-hidden="true"
                    title={event.calendar}
                    style={{
                      flex: 'none',
                      width: '0.6rem',
                      height: '0.6rem',
                      borderRadius: '50%',
                      background: event.color ?? 'currentColor',
                      opacity: event.color ? 1 : 0.4,
                    }}
                  />
                  <span style={{ flex: 'none', minWidth: '5.5rem', opacity: 0.75 }}>
                    {event.allDay ? 'All day' : timeLabel(event, locale)}
                  </span>
                  <span>
                    {event.title}
                    {event.location ? (
                      <span style={{ opacity: 0.7 }}> · {event.location}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export const agendaWidget = defineWidget({
  type: 'calendar.agenda',
  title: 'Agenda',
  description: 'The coming days’ events from the household’s calendars.',
  defaultSpan: 2,
  status: 'stable',
  options,
  Component: Agenda,
})
