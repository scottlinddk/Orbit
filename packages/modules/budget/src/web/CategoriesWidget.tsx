import {
  defineWidget,
  resolveOptions,
  type WidgetOption,
  type WidgetProps,
} from '@orbit/widget-sdk'
import { currencyOption, formatMoney, localeOf } from './format.ts'
import { CategoryGlyph } from './icons.tsx'
import { Money } from './Money.tsx'
import { sampleCategories } from './sampleData.ts'
import { Trend } from './Trend.tsx'
import styles from './CategoriesWidget.module.css'

const options: readonly WidgetOption[] = [
  {
    kind: 'select',
    key: 'count',
    label: 'Categories',
    choices: [
      { value: '2', label: 'Top 2' },
      { value: '4', label: 'Top 4' },
    ],
    default: '4',
  },
  currencyOption,
]

function Categories({ config }: WidgetProps) {
  const { count, currency } = resolveOptions(options, config) as { count: string; currency: string }
  const locale = localeOf(config)
  const shown = [...sampleCategories].sort((a, b) => b.amount - a.amount).slice(0, Number(count))

  return (
    <ul className={styles.grid}>
      {shown.map((category) => (
        <li key={category.id} className={styles.tile}>
          <span className={styles.top}>
            <span className={styles.name}>{category.name}</span>
            <CategoryGlyph name={category.icon} />
          </span>
          <span
            className={styles.amount}
            aria-label={formatMoney(category.amount, currency, locale)}
          >
            <Money amount={category.amount} currency={currency} locale={locale} />
          </span>
          <Trend
            change={category.change}
            suffix="from last month"
            locale={locale}
            tone="spending"
          />
        </li>
      ))}
    </ul>
  )
}

export const categoriesWidget = defineWidget({
  type: 'budget.categories',
  title: 'Spending by category',
  description:
    'Spending per category and its change. Shows sample data until a data source exists.',
  defaultSpan: 2,
  status: 'preview',
  options,
  Component: Categories,
})
