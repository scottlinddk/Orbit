import { useId, useState } from 'react'
import styles from './ThemePage.module.css'

interface Props {
  value: string
  onChange: (name: string) => void
}

/**
 * The theme name can be emptied while retyping it, but an empty name is never saved. The text
 * the person is typing is kept locally, and the saved name returns when the field loses focus.
 */
export function NameField({ value, onChange }: Props) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className={styles.nameRow}>
      <label htmlFor={id} className={styles.label}>
        Theme name
      </label>
      <input
        id={id}
        className={styles.text}
        value={draft ?? value}
        maxLength={40}
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim()) onChange(event.target.value)
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}
