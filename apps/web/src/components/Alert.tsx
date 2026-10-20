import type { ReactNode } from 'react'
import styles from './Alert.module.css'

interface AlertProps {
  tone?: 'error' | 'info'
  children: ReactNode
}

/** Errors use role="alert" so screen readers announce them as soon as they appear. */
export function Alert({ tone = 'error', children }: AlertProps) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`${styles.alert} ${styles[tone]}`}>
      {children}
    </div>
  )
}
