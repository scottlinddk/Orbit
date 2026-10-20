import { defineWidget, resolveOptions, type WidgetProps } from '@orbit/widget-sdk'
import { currencyOption, formatMoney, localeOf } from './format.ts'
import { Money } from './Money.tsx'
import { sampleCard } from './sampleData.ts'
import { TrendArrow } from './icons.tsx'
import { Trend } from './Trend.tsx'
import styles from './CardsWidget.module.css'

const options = [currencyOption] as const

function Cards({ config }: WidgetProps) {
  const { currency } = resolveOptions(options, config) as { currency: string }
  const locale = localeOf(config)
  const card = sampleCard
  // Moving money needs a data source and a bank. The buttons are shown so the layout is real,
  // and disabled so they cannot be mistaken for working.
  const note = 'Sample data. Not connected to a bank.'

  return (
    <div className={styles.root}>
      <p className={styles.amount}>
        <Money amount={card.balance} currency={currency} locale={locale} />
      </p>
      <div className={styles.meta}>
        <Trend change={card.change} suffix="this month" locale={locale} tone="plain" />
        <span className={styles.limit}>
          Credit limit: {formatMoney(card.limit, currency, locale)}
        </span>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.action} disabled title={note}>
          <TrendArrow up />
          Deposit
        </button>
        <button type="button" className={styles.action} disabled title={note}>
          <TrendArrow up={false} />
          Withdraw
        </button>
      </div>

      <div className={styles.stack}>
        <span className={`${styles.layer} ${styles.layerBack}`} aria-hidden="true" />
        <span className={`${styles.layer} ${styles.layerMiddle}`} aria-hidden="true" />
        <div className={`${styles.layer} ${styles.layerFront}`}>
          <span>
            <span aria-hidden="true">•••• </span>
            <span className={styles.sr}>Card ending </span>
            {card.last4}
          </span>
          <span>{card.expires}</span>
          <span className={styles.network}>{card.network}</span>
        </div>
      </div>
    </div>
  )
}

export const cardsWidget = defineWidget({
  type: 'budget.cards',
  title: 'Credit cards',
  description: 'Balance and limit of a card. Shows sample data until a data source exists.',
  defaultSpan: 2,
  status: 'preview',
  tone: 'accent',
  options,
  Component: Cards,
})
