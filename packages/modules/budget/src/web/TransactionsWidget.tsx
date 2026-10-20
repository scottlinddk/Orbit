import {
  defineWidget,
  resolveOptions,
  type WidgetOption,
  type WidgetProps,
} from '@orbit/widget-sdk'
import { useState } from 'react'
import { currencyOption, formatMoney, localeOf } from './format.ts'
import { sampleTransactions } from './sampleData.ts'
import styles from './TransactionsWidget.module.css'

const options: readonly WidgetOption[] = [
  {
    kind: 'number',
    key: 'rows',
    label: 'Rows',
    help: 'How many transactions to show before "View all".',
    min: 2,
    max: 8,
    step: 1,
    default: 4,
  },
  currencyOption,
]

function Transactions({ config }: WidgetProps) {
  const { rows, currency } = resolveOptions(options, config) as { rows: number; currency: string }
  const locale = localeOf(config)
  const [all, setAll] = useState(false)
  const shown = all ? sampleTransactions : sampleTransactions.slice(0, Math.round(rows))
  const canExpand = sampleTransactions.length > Math.round(rows)

  return (
    <div className={styles.root}>
      <ul className={styles.list}>
        {shown.map((t) => (
          <li key={t.id} className={styles.row}>
            <span className={styles.avatar} aria-hidden="true">
              {t.name.charAt(0)}
            </span>
            <span className={styles.who}>
              <span className={styles.name}>{t.name}</span>
              <span className={styles.when}>{t.when}</span>
            </span>
            <span
              className={`${styles.status} ${t.status === 'Completed' ? styles.done : styles.pending}`}
            >
              {t.status}
            </span>
            <span className={styles.card}>
              <span aria-hidden="true">•••• </span>
              <span className={styles.sr}>Card ending </span>
              {t.last4}
            </span>
            <span className={`${styles.amount} ${t.amount < 0 ? styles.out : ''}`}>
              {formatMoney(t.amount, currency, locale)}
            </span>
          </li>
        ))}
      </ul>
      {canExpand ? (
        <button
          type="button"
          className={styles.more}
          aria-expanded={all}
          onClick={() => setAll((value) => !value)}
        >
          {all ? 'Show fewer' : 'View all'}
        </button>
      ) : null}
    </div>
  )
}

export const transactionsWidget = defineWidget({
  type: 'budget.transactions',
  title: 'Recent transactions',
  description: 'The latest transactions. Shows sample data until a data source exists.',
  defaultSpan: 2,
  status: 'preview',
  options,
  Component: Transactions,
})
