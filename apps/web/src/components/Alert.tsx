import type { ReactNode } from 'react'
import { Notice } from '@scttlnd/ui'

interface AlertProps {
  tone?: 'error' | 'info'
  children: ReactNode
}

/** Errors use role="alert" so screen readers announce them as soon as they appear. */
export function Alert({ tone = 'error', children }: AlertProps) {
  return <Notice tone={tone === 'error' ? 'danger' : 'info'}>{children}</Notice>
}
