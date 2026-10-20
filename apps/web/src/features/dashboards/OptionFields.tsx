import { resolveOptions, type OptionValue, type WidgetOption } from '@orbit/widget-sdk'
import { useId, useState, type ReactNode } from 'react'
import styles from './OptionFields.module.css'

interface Props {
  options: readonly WidgetOption[]
  /** The saved settings of the placement. */
  config: Readonly<Record<string, unknown>>
  disabled: boolean
  /** The whole new settings. A setting equal to its default is left out, so saved settings stay small. */
  onChange: (config: Record<string, unknown>) => void
}

/** Draws a form from a widget's option descriptors. The widget ships no editor UI of its own. */
export function OptionFields({ options, config, disabled, onChange }: Props) {
  const values = resolveOptions(options, config)

  function commit(option: WidgetOption, value: OptionValue) {
    const next: Record<string, unknown> = { ...config }
    if (value === option.default) delete next[option.key]
    else next[option.key] = value
    onChange(next)
  }

  return (
    <div className={styles.fields}>
      {options.map((option) => (
        <Field
          key={option.key}
          option={option}
          value={values[option.key] as OptionValue}
          disabled={disabled}
          onCommit={(value) => commit(option, value)}
        />
      ))}
    </div>
  )
}

interface FieldProps {
  option: WidgetOption
  value: OptionValue
  disabled: boolean
  onCommit: (value: OptionValue) => void
}

function Field({ option, value, disabled, onCommit }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const help = option.help ? (
    <p id={helpId} className={styles.help}>
      {option.help}
    </p>
  ) : null
  const describedBy = option.help ? helpId : undefined

  switch (option.kind) {
    case 'select':
      return (
        <div className={styles.field}>
          <label htmlFor={id} className={styles.label}>
            {option.label}
          </label>
          <select
            id={id}
            className={styles.control}
            value={String(value)}
            disabled={disabled}
            aria-describedby={describedBy}
            onChange={(event) => onCommit(event.target.value)}
          >
            {option.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      )
    case 'toggle':
      return (
        <div className={styles.field}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value === true}
              disabled={disabled}
              aria-describedby={describedBy}
              onChange={(event) => onCommit(event.target.checked)}
            />
            {option.label}
          </label>
          {help}
        </div>
      )
    case 'number':
      return (
        <DraftField
          id={id}
          label={option.label}
          type="number"
          value={String(value)}
          disabled={disabled}
          describedBy={describedBy}
          min={option.min}
          max={option.max}
          step={option.step}
          // Out of range numbers are clamped by resolveOptions when read, and here when saved.
          onCommit={(text) => {
            const parsed = Number(text)
            if (text.trim() !== '' && Number.isFinite(parsed)) {
              onCommit(Math.min(option.max, Math.max(option.min, parsed)))
            }
          }}
        >
          {help}
        </DraftField>
      )
    case 'text':
      return (
        <DraftField
          id={id}
          label={option.label}
          type="text"
          value={String(value)}
          disabled={disabled}
          describedBy={describedBy}
          maxLength={option.maxLength}
          onCommit={(text) => onCommit(text)}
        >
          {help}
        </DraftField>
      )
  }
}

interface DraftProps {
  id: string
  label: string
  type: 'number' | 'text'
  value: string
  disabled: boolean
  describedBy: string | undefined
  min?: number
  max?: number
  step?: number | undefined
  maxLength?: number
  onCommit: (text: string) => void
  children: ReactNode
}

/** Typing is local. The setting is saved when the field loses focus or Enter is pressed. */
function DraftField({
  id,
  label,
  value,
  disabled,
  describedBy,
  onCommit,
  children,
  ...input
}: DraftProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value

  function commit() {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.control}
        {...input}
        value={shown}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
      {children}
    </div>
  )
}
