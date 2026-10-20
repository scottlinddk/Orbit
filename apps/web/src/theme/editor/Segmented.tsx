import { useId } from 'react'
import styles from './Controls.module.css'

interface Props<T extends string> {
  legend: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

/** A small set of exclusive choices drawn as pills. Real radio buttons, so keyboard and screen readers work. */
export function Segmented<T extends string>({ legend, value, options, onChange }: Props<T>) {
  const name = useId()
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.segments}>
        {options.map((option) => (
          <label key={option.value} className={styles.segment}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
