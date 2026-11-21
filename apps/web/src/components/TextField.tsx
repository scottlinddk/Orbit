import type { InputHTMLAttributes } from 'react'
import { Field, Input } from '@scttlnd/ui'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
}

export function TextField({ label, hint, ...input }: TextFieldProps) {
  return (
    <Field label={label} hint={hint}>
      {(control) => <Input {...control} {...input} />}
    </Field>
  )
}
