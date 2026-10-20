import { defineWidget } from '@orbit/widget-sdk'

function Agenda() {
  return (
    <p style={{ margin: 0 }}>
      Connect a calendar to see this week’s events here. Calendar sources are not available yet.
    </p>
  )
}

export const agendaWidget = defineWidget({
  type: 'calendar.agenda',
  title: 'Agenda',
  description: 'The week’s events from a connected calendar.',
  defaultSpan: 2,
  status: 'preview',
  Component: Agenda,
})
