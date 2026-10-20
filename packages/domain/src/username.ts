import { invariant } from './errors.ts'
import type { Brand } from './ids.ts'

/** A login name. Always stored lowercase, so "Alice" and "alice" are the same account. */
export type Username = Brand<string, 'Username'>

const USERNAME = /^[a-z0-9][a-z0-9._-]*$/

export const Username = (raw: string): Username => {
  const value = raw.trim().toLowerCase()
  invariant(
    value.length >= 3 && value.length <= 32 && USERNAME.test(value),
    'Username must be 3 to 32 characters: letters, digits, dot, dash or underscore, starting with a letter or digit',
  )
  return value as Username
}
