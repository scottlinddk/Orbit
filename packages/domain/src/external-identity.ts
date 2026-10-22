import { invariant } from './errors.ts'
import type { UserId } from './ids.ts'

/**
 * An account at an external identity provider (OpenID Connect), tied to one Orbit user. The pair
 * (issuer, subject) is the identity. Email addresses and usernames are never used to match, because
 * providers let people change them and some do not verify them.
 */
export interface ExternalIdentity {
  readonly issuer: string
  readonly subject: string
  readonly userId: UserId
  readonly createdAt: Date
}

/** The OpenID Connect specification caps `sub` at 255 ASCII characters. */
export const MAX_SUBJECT_LENGTH = 255
export const MAX_ISSUER_LENGTH = 512

export function createExternalIdentity(input: {
  issuer: string
  subject: string
  userId: UserId
  now: Date
}): ExternalIdentity {
  invariant(
    input.issuer.length > 0 && input.issuer.length <= MAX_ISSUER_LENGTH,
    'The identity provider address is missing or too long',
  )
  invariant(
    input.subject.length > 0 && input.subject.length <= MAX_SUBJECT_LENGTH,
    'The identity provider sent an invalid subject',
  )
  return {
    issuer: input.issuer,
    subject: input.subject,
    userId: input.userId,
    createdAt: input.now,
  }
}
