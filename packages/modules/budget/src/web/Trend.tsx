import { formatPercent } from './format.ts'
import { TrendArrow } from './icons.tsx'
import styles from './Trend.module.css'

interface Props {
  change: number
  /** Text after the percentage, such as "this month". */
  suffix: string
  locale?: string | undefined
  /**
   * `plain` follows the surrounding text color (for accent cards). `spending` colors a rise as
   * bad and a fall as good, because the numbers are money spent.
   */
  tone: 'plain' | 'spending'
}

export function Trend({ change, suffix, locale, tone }: Props) {
  const up = change >= 0
  const direction = up ? 'up' : 'down'
  const toneClass = tone === 'plain' ? styles.plain : up ? styles.bad : styles.good
  return (
    <span className={`${styles.trend} ${toneClass}`}>
      <TrendArrow up={up} />
      <span className={styles.sr}>{direction} </span>
      {formatPercent(change, locale)} {suffix}
    </span>
  )
}
