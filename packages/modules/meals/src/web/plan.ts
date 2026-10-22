import type { MealView } from './host.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const ORDER = ['breakfast', 'lunch', 'dinner', 'side', 'snack', 'drink', 'dessert']

/** `YYYY-MM-DD` of an instant on the wall clock of the person looking, not of the server. */
export function localDay(instant: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`
}

/** Adds whole days to a plain date. Pure calendar arithmetic, so DST cannot matter. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export interface MealDay {
  readonly day: string
  readonly meals: readonly MealView[]
}

/** Meals grouped by day, days in order, and within a day breakfast before dinner. */
export function groupByDay(meals: readonly MealView[]): MealDay[] {
  const byDay = new Map<string, MealView[]>()
  for (const meal of meals) byDay.set(meal.date, [...(byDay.get(meal.date) ?? []), meal])
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      meals: [...list].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
    }))
}

/** "Today", "Tomorrow", or the weekday and date. A plain date has no time zone, so UTC is exact. */
export function dayLabel(day: string, today: string, locale?: string): string {
  if (day === today) return 'Today'
  if (day === addDays(today, 1)) return 'Tomorrow'
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}

export const typeLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1)
