import type { ButtonHTMLAttributes } from 'react'
import { Button as UiButton } from '@scttlnd/ui'
import styles from './Button.module.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  /** Disables the button and announces that work is in progress. */
  busy?: boolean
}

/** App button API over @scttlnd/ui's Button. `danger` is a secondary button in the danger color. */
export function Button({
  variant = 'secondary',
  busy = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [variant === 'danger' ? styles.danger : '', className].filter(Boolean).join(' ')
  return (
    <UiButton
      {...rest}
      type={type}
      variant={variant === 'primary' ? 'primary' : 'secondary'}
      className={classes || undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </UiButton>
  )
}
