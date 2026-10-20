import { useId } from 'react'
import { FONT_CATALOG } from '../fonts/catalog.ts'
import { SYSTEM_FONTS, fontStack } from '../fonts/stacks.ts'
import type { FontCategory } from '../fonts/types.ts'
import styles from './Controls.module.css'

interface Props {
  label: string
  value: string
  onChange: (id: string) => void
}

const GROUPS: readonly { category: FontCategory; label: string }[] = [
  { category: 'sans', label: 'Sans serif' },
  { category: 'serif', label: 'Serif' },
  { category: 'mono', label: 'Monospace' },
]

/** Picks from the bundled Google Fonts. The sample line is set in the chosen font. */
export function FontField({ label, value, onChange }: Props) {
  const id = useId()
  return (
    <div className={styles.font}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {GROUPS.map((group) => (
          <optgroup key={group.category} label={group.label}>
            {FONT_CATALOG.filter((font) => font.category === group.category).map((font) => (
              <option key={font.id} value={font.id}>
                {font.label}
              </option>
            ))}
          </optgroup>
        ))}
        <optgroup label="Already on your device">
          {SYSTEM_FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </optgroup>
      </select>
      <p className={styles.sample} style={{ fontFamily: fontStack(value) }} aria-hidden="true">
        Welcome back. Blåbærgrød 0123456789
      </p>
    </div>
  )
}
