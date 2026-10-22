import { agendaWidget } from './AgendaWidget.tsx'
import { todayWidget } from './TodayWidget.tsx'

export const widgets = [todayWidget, agendaWidget]
export { CalendarDataContext } from './data.ts'
export type { AgendaEvent, CalendarData } from './data.ts'
