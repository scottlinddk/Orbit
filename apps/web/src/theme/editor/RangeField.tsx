import { useId } from 'react'
import styles from './Controls.module.css'

interface Props {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}

export function RangeField({ label, value, min, max, unit, onChange }: Props) {
  const id = useId()
  return (
    <div className={styles.range}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.rangeRow}>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output htmlFor={id} className={styles.value}>
          {value}
          {unit}
        </output>
      </div>
    </div>
  )
}
