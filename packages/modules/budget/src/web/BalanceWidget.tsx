import { defineWidget, resolveOptions, type WidgetProps } from '@orbit/widget-sdk'
import { currencyOption, localeOf } from './format.ts'
import { SwapIcon, TrendArrow } from './icons.tsx'
import { Money } from './Money.tsx'
import { sampleBalance, sampleCard } from './sampleData.ts'
import { Trend } from './Trend.tsx'
import styles from './BalanceWidget.module.css'

const options = [currencyOption] as const

function Balance({ config }: WidgetProps) {
  const { currency } = resolveOptions(options, config) as { currency: string }
  const locale = localeOf(config)
  const card = sampleCard
  // Moving money needs a data source and a bank, so the buttons are shown and disabled.
  const note = 'Sample data. Not connected to a bank.'

  return (
    <div className={styles.root}>
      <p className={styles.amount}>
        <Money amount={sampleBalance.amount} currency={currency} locale={locale} />
      </p>
      <Trend change={sampleBalance.change} suffix="this month" locale={locale} tone="plain" />

      <div className={styles.stack}>
        <span className={`${styles.layer} ${styles.back}`} aria-hidden="true" />
        <span className={`${styles.layer} ${styles.middle}`} aria-hidden="true" />
        <div className={`${styles.layer} ${styles.front}`}>
          <span>
            <span aria-hidden="true">•••• </span>
            <span className={styles.sr}>Card ending </span>
            {card.last4}
          </span>
          <span>{card.expires}</span>
          <span className={styles.network}>{card.network}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.pill} disabled title={note}>
          <TrendArrow up />
          Deposit
        </button>
        <button type="button" className={styles.round} disabled title={note} aria-label="Transfer">
          <SwapIcon />
        </button>
        <button type="button" className={styles.pill} disabled title={note}>
          <TrendArrow up={false} />
          Withdraw
        </button>
      </div>
    </div>
  )
}

export const balanceWidget = defineWidget({
  type: 'budget.balance',
  title: 'Balance',
  description: 'Total balance with a card and quick actions. Shows sample data.',
  defaultSpan: 1,
  status: 'preview',
  tone: 'accent',
  options,
  Component: Balance,
})
