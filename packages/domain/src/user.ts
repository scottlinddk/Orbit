import { invariant } from './errors.ts'
import type { UserId } from './ids.ts'

/**
 * A person known to the platform. Credentials live in the identity adapter, not here,
 * so the domain stays independent of how someone logs in.
 */
export interface User {
  readonly id: UserId
  readonly displayName: string
}

export function createUser(input: { id: UserId; displayName: string }): User {
  const displayName = input.displayName.trim()
  invariant(
    displayName.length > 0 && displayName.length <= 80,
    'Display name must be 1 to 80 characters',
  )
  return { id: input.id, displayName }
}
