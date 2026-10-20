import { useId, useState } from 'react'
import { normalizeHex } from './hex.ts'
import styles from './Controls.module.css'

interface Props {
  label: string
  value: string
  onChange: (hex: string) => void
}

/** A color picker plus a hex box, because a picker alone cannot be typed into or pasted from a brand guide. */
export function ColorField({ label, value, onChange }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const valid = normalizeHex(shown) !== null

  return (
    <div className={styles.color}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.colorInputs}>
        <input
          type="color"
          className={styles.swatch}
          aria-label={`${label}, color picker`}
          value={value}
          onChange={(event) => {
            setDraft(null)
            onChange(event.target.value)
          }}
        />
        <input
          id={id}
          type="text"
          className={styles.hex}
          value={shown}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={7}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(event) => {
            setDraft(event.target.value)
            const hex = normalizeHex(event.target.value)
            if (hex && hex !== value) onChange(hex)
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      {valid ? null : (
        <p id={`${id}-error`} className={styles.error}>
          Use a color like #1a2b3c
        </p>
      )}
    </div>
  )
}
