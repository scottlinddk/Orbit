import type { SelectHTMLAttributes } from 'react'
import { Field, Select } from '@scttlnd/ui'

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  options: readonly { value: string; label: string }[]
}

export function SelectField({ label, options, ...select }: SelectFieldProps) {
  return (
    <Field label={label}>
      {(control) => (
        <Select {...control} {...select}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}
