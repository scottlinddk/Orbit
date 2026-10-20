import {
  defineWidget,
  resolveOptions,
  type WidgetOption,
  type WidgetProps,
} from '@orbit/widget-sdk'
import { useMemo, useState, type CSSProperties } from 'react'
import { currencyOption, formatMoney, formatThousands, localeOf } from './format.ts'
import { Money } from './Money.tsx'
import { calendarYear, monthsEnding } from './sampleData.ts'
import { Trend } from './Trend.tsx'
import styles from './OverviewWidget.module.css'

const AXIS = [2000, 1500, 1000, 500] as const
const TOP = AXIS[0]

const options: readonly WidgetOption[] = [
  {
    kind: 'select',
    key: 'period',
    label: 'Period',
    help: 'How many months the chart covers.',
    choices: [
      { value: 'year', label: 'Year' },
      { value: 'half', label: 'Six months' },
      { value: 'quarter', label: 'Three months' },
    ],
    default: 'year',
  },
  currencyOption,
]

function Overview({ config }: WidgetProps) {
  const { period: configured, currency } = resolveOptions(options, config) as {
    period: string
    currency: string
  }
  // The saved period is the starting view. The viewer can change it without editing the dashboard.
  const [chosenPeriod, setChosenPeriod] = useState<string | null>(null)
  const period = chosenPeriod ?? configured
  const locale = localeOf(config)
  const now = useMemo(() => new Date(), [])
  const points = useMemo(
    () => (period === 'year' ? calendarYear(now) : monthsEnding(now, period === 'half' ? 6 : 3)),
    [period, now],
  )
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [chosen, setChosen] = useState<string | null>(null)
  const current = points.find((p) => p.key === currentKey) ?? points[points.length - 1]!
  const selected = points.find((p) => p.key === chosen) ?? current
  const selectedIndex = points.indexOf(selected)
  const position = (selectedIndex + 0.5) / points.length
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
  const shortMonth = new Intl.DateTimeFormat(locale, { month: 'short' })

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <p className={styles.amount}>
          <Money amount={current.amount} currency={currency} locale={locale} />
        </p>
        <label className={styles.period}>
          <span className={styles.sr}>Period</span>
          <select
            value={period}
            onChange={(event) => {
              setChosenPeriod(event.target.value)
              setChosen(null)
            }}
          >
            <option value="year">Year</option>
            <option value="half">Six months</option>
            <option value="quarter">Three months</option>
          </select>
        </label>
      </div>
      <Trend change={current.change} suffix="this month" locale={locale} tone="plain" />

      <div className={styles.chart}>
        <ul className={styles.yAxis} aria-hidden="true">
          {AXIS.map((tick) => (
            <li key={tick}>{formatThousands(tick)}</li>
          ))}
        </ul>
        <div className={styles.plot} aria-hidden="true">
          <div className={styles.tooltip} style={{ '--position': position } as CSSProperties}>
            <strong>{formatMoney(selected.amount, currency, locale)}</strong>
            <span className={styles.tooltipChange}>
              <Trend change={selected.change} suffix="" locale={locale} tone="plain" />
            </span>
            <span className={styles.tooltipMonth}>for {monthName.format(selected.date)}</span>
          </div>
          {points.map((point) => (
            <div
              key={point.key}
              className={`${styles.month} ${point.key === selected.key ? styles.active : ''}`}
            >
              {point.bars.map((bar, index) => (
                <span
                  key={index}
                  className={styles.bar}
                  style={{ height: `${(bar / TOP) * 100}%` }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className={styles.months} role="group" aria-label="Choose a month">
          {points.map((point) => (
            <button
              key={point.key}
              type="button"
              className={styles.monthButton}
              aria-pressed={point.key === selected.key}
              aria-label={monthName.format(point.date)}
              onClick={() => setChosen(point.key)}
            >
              {shortMonth.format(point.date)}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.summary} role="status">
        {monthName.format(selected.date)}: {formatMoney(selected.amount, currency, locale)}
      </p>
    </div>
  )
}

export const overviewWidget = defineWidget({
  type: 'budget.overview',
  title: 'Overview',
  description: 'Monthly spending as a bar chart. Shows sample data until a data source exists.',
  defaultSpan: 2,
  status: 'preview',
  tone: 'accent',
  options,
  Component: Overview,
})
