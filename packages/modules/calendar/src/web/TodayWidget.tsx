import { useContext } from 'react'
import { defineWidget, type WidgetProps } from '@orbit/widget-sdk'
import { eventsToday, timeLabel } from './agenda.ts'
import { CalendarDataContext } from './data.ts'

/** ISO 8601 week number (weeks start Monday, week 1 contains the first Thursday). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

function TodaysEvents({
  events,
  locale,
}: {
  events: ReturnType<typeof eventsToday>
  locale: string | undefined
}) {
  if (events.length === 0)
    return <p style={{ margin: '0.5rem 0 0', opacity: 0.8 }}>Nothing planned today.</p>
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: '0.5rem 0 0',
        padding: 0,
        display: 'grid',
        gap: '0.125rem',
      }}
    >
      {events.slice(0, 4).map((event) => (
        <li key={event.id}>
          <span style={{ opacity: 0.75 }}>
            {event.allDay ? 'All day' : timeLabel(event, locale)}
          </span>{' '}
          {event.title}
        </li>
      ))}
      {events.length > 4 ? <li style={{ opacity: 0.75 }}>+{events.length - 4} more</li> : null}
    </ul>
  )
}

function Today({ config }: WidgetProps) {
  const data = useContext(CalendarDataContext)
  const now = new Date()
  // undefined locale means "the browser's language", so a Danish browser shows Danish.
  const locale = typeof config.locale === 'string' ? config.locale : undefined
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now)
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  return (
    <div>
      <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, textTransform: 'capitalize' }}>
        {weekday}
      </p>
      <p style={{ margin: 0 }}>{date}</p>
      <p style={{ margin: '0.25rem 0 0', opacity: 0.7 }}>Week {isoWeek(now)}</p>
      {data.state === 'ready' ? (
        <TodaysEvents events={eventsToday(data.events, now)} locale={locale} />
      ) : null}
    </div>
  )
}

export const todayWidget = defineWidget({
  type: 'calendar.today',
  title: 'Today',
  description:
    'Today’s date and week number, and what is planned today when a calendar is connected.',
  defaultSpan: 1,
  status: 'stable',
  Component: Today,
})
