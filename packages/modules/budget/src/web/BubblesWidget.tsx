import {
  defineWidget,
  resolveOptions,
  type WidgetOption,
  type WidgetProps,
} from '@orbit/widget-sdk'
import type { CSSProperties } from 'react'
import { formatShare, localeOf } from './format.ts'
import { CategoryGlyph } from './icons.tsx'
import { sampleShares } from './sampleData.ts'
import styles from './BubblesWidget.module.css'

const options: readonly WidgetOption[] = [
  {
    kind: 'select',
    key: 'view',
    label: 'View',
    help: 'Narrow cards always show the list.',
    choices: [
      { value: 'bubbles', label: 'Bubbles' },
      { value: 'list', label: 'List' },
    ],
    default: 'bubbles',
  },
]

const LARGEST = Math.max(...sampleShares.map((s) => s.percent))

function Bubbles({ config }: WidgetProps) {
  const { view } = resolveOptions(options, config) as { view: string }
  const locale = localeOf(config)
  const shares = [...sampleShares].sort((a, b) => b.percent - a.percent)

  // The numbers are always text. The size and the wedge repeat them for the eye, so nothing
  // depends on judging an area. The list is the same data without the decoration.
  return (
    <ul className={`${styles.root} ${view === 'list' ? styles.list : styles.bubbles}`}>
      {shares.map((share) => (
        <li
          key={share.id}
          className={styles.item}
          style={
            {
              '--p': share.percent,
              // Area, not diameter, follows the share.
              '--k': Math.sqrt(share.percent / LARGEST),
            } as CSSProperties
          }
        >
          <span className={styles.glyph}>
            <CategoryGlyph name={share.icon} />
          </span>
          <span className={styles.name}>{share.name}</span>
          <span className={styles.percent}>{formatShare(share.percent, locale)}</span>
          <span className={styles.bar} aria-hidden="true" />
        </li>
      ))}
    </ul>
  )
}

export const bubblesWidget = defineWidget({
  type: 'budget.bubbles',
  title: 'Expenses',
  description: 'Where the month’s money went, as bubbles or a list. Shows sample data.',
  defaultSpan: 2,
  status: 'preview',
  tone: 'accent',
  options,
  Component: Bubbles,
})
