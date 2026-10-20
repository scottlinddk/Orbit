/**
 * Deterministic sample data. The same inputs always give the same numbers, so the widgets look
 * the same on every render and tests can assert on them. Replace this file when a real data
 * source exists.
 */

/** Small seeded PRNG (mulberry32), so no `Math.random` makes the chart jump. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const BARS_PER_MONTH = 10
const MIN_BAR = 450
const MAX_BAR = 2000

export interface MonthPoint {
  /** `2026-04`. Also the key of the month in the chart. */
  readonly key: string
  /** Start of the month, for formatting its names in the reader's language. */
  readonly date: Date
  /** The month's spending, rounded to cents. */
  readonly amount: number
  /** Change against the month before, in percent, rounded to two decimals. */
  readonly change: number
  /** The bars drawn for the month, each between 450 and 2000. */
  readonly bars: readonly number[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

function monthData(year: number, month: number): { amount: number; bars: number[] } {
  const next = seeded(year * 12 + month + 1)
  // Spending hovers around a level that moves a little from month to month, and the bars
  // scatter around that level, so changes stay in a believable range.
  const level = 1150 + next() * 200
  const bars = Array.from({ length: BARS_PER_MONTH }, () =>
    Math.min(MAX_BAR, Math.max(MIN_BAR, level * (0.45 + next() * 1.1))),
  )
  return { amount: round2(level), bars: bars.map(round2) }
}

/** `count` consecutive months ending at the month of `now`, oldest first. */
export function monthsEnding(now: Date, count: number): MonthPoint[] {
  const points: MonthPoint[] = []
  for (let back = count - 1; back >= 0; back--) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1)
    const current = monthData(date.getFullYear(), date.getMonth())
    const before = monthData(previous.getFullYear(), previous.getMonth())
    points.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      date,
      amount: current.amount,
      change: round2(((current.amount - before.amount) / before.amount) * 100),
      bars: current.bars,
    })
  }
  return points
}

/** January to December of `now`'s year. Months after `now` are still drawn, as a forecast. */
export function calendarYear(now: Date): MonthPoint[] {
  return monthsEnding(new Date(now.getFullYear(), 11, 1), 12)
}

export interface CardSummary {
  readonly balance: number
  readonly change: number
  readonly limit: number
  readonly last4: string
  readonly expires: string
  readonly network: string
}

export const sampleCard: CardSummary = {
  balance: 1038.47,
  change: 2.46,
  limit: 5000,
  last4: '9286',
  expires: '08 / 32',
  network: 'Visa',
}

export type TransactionStatus = 'In progress' | 'Completed'

export interface Transaction {
  readonly id: string
  readonly name: string
  readonly when: string
  readonly status: TransactionStatus
  readonly last4: string
  /** Negative for money that left the account. */
  readonly amount: number
}

export const sampleTransactions: readonly Transaction[] = [
  {
    id: 't1',
    name: 'Cloud software',
    when: 'Today, 09:42',
    status: 'In progress',
    last4: '2841',
    amount: -59.99,
  },
  {
    id: 't2',
    name: 'Payout',
    when: 'Today, 08:15',
    status: 'Completed',
    last4: '9286',
    amount: 187.5,
  },
  {
    id: 't3',
    name: 'Grocery market',
    when: 'Yesterday, 18:30',
    status: 'Completed',
    last4: '9286',
    amount: -86.12,
  },
  {
    id: 't4',
    name: 'Electric utility',
    when: 'Yesterday, 07:05',
    status: 'Completed',
    last4: '2841',
    amount: -142.7,
  },
  {
    id: 't5',
    name: 'Streaming service',
    when: 'Mon, 21:10',
    status: 'Completed',
    last4: '2841',
    amount: -13.99,
  },
  {
    id: 't6',
    name: 'Pharmacy',
    when: 'Mon, 12:48',
    status: 'Completed',
    last4: '9286',
    amount: -24.35,
  },
  {
    id: 't7',
    name: 'Bike repair',
    when: 'Sun, 15:20',
    status: 'Completed',
    last4: '9286',
    amount: -64,
  },
  {
    id: 't8',
    name: 'Refund',
    when: 'Sat, 10:02',
    status: 'Completed',
    last4: '9286',
    amount: 35.9,
  },
]

export type CategoryIcon = 'cart' | 'shirt' | 'cup' | 'sport'

export interface Category {
  readonly id: string
  readonly name: string
  readonly icon: CategoryIcon
  readonly amount: number
  /** Change against last month, in percent. Positive means spending went up. */
  readonly change: number
}

export const sampleCategories: readonly Category[] = [
  { id: 'groceries', name: 'Groceries', icon: 'cart', amount: 604.36, change: 2.46 },
  { id: 'clothes', name: 'Clothes and shoes', icon: 'shirt', amount: 296.65, change: -1.84 },
  { id: 'cafes', name: 'Cafes and restaurants', icon: 'cup', amount: 214.9, change: 0.92 },
  { id: 'sport', name: 'Sport', icon: 'sport', amount: 88, change: -3.1 },
]
