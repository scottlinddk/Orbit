import type { UserId } from '@orbit/domain'

/** The authenticated caller, produced by the identity adapter after login. */
export interface Actor {
  readonly userId: UserId
}
