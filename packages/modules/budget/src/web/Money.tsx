import { moneyParts } from './format.ts'
import styles from './Money.module.css'

interface Props {
  amount: number
  currency: string
  locale?: string | undefined
}

/** An amount with its cents drawn lighter, as in the large figures of the overview. */
export function Money({ amount, currency, locale }: Props) {
  return (
    <>
      {moneyParts(amount, currency, locale).map((part, index) =>
        part.minor ? (
          <span key={index} className={styles.minor}>
            {part.value}
          </span>
        ) : (
          part.value
        ),
      )}
    </>
  )
}
