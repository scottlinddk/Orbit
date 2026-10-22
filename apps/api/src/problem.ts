import {
  FeedTooLargeError,
  ForbiddenError,
  InvalidCredentialsError,
  LocalLoginDisabledError,
  NotFoundError,
  OidcError,
  OidcIdentityTakenError,
  RegistrationClosedError,
  SetupCodeInvalidError,
  UsernameTakenError,
} from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'
import { WebhookRejectedError } from '@orbit/module-planets/server'
import type { Problem } from '@orbit/contracts'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod'

export class UnauthenticatedError extends Error {
  constructor() {
    super('Sign in required')
    this.name = 'UnauthenticatedError'
  }
}

export class OriginNotAllowedError extends Error {
  constructor() {
    super('Request origin does not match ORBIT_PUBLIC_URL')
    this.name = 'OriginNotAllowedError'
  }
}

const problem = (status: number, slug: string, title: string, detail?: string): Problem => ({
  type: `urn:orbit:problem:${slug}`,
  title,
  status,
  ...(detail === undefined ? {} : { detail }),
})

/**
 * Maps any thrown error to a problem. Messages from our own error classes are written to be
 * shown to users. Anything unrecognized becomes a generic 500 with no detail, so internals
 * never leak.
 */
export function toProblem(error: unknown): Problem {
  if (error instanceof UnauthenticatedError)
    return problem(401, 'unauthenticated', 'Unauthorized', error.message)
  if (error instanceof InvalidCredentialsError)
    return problem(401, 'invalid-credentials', 'Unauthorized', error.message)
  if (error instanceof NotFoundError) return problem(404, 'not-found', 'Not Found', error.message)
  if (error instanceof FeedTooLargeError)
    return problem(413, 'feed-too-large', 'Content Too Large', error.message)
  if (error instanceof ForbiddenError) return problem(403, 'forbidden', 'Forbidden', error.message)
  if (error instanceof RegistrationClosedError)
    return problem(403, 'registration-closed', 'Forbidden', error.message)
  if (error instanceof SetupCodeInvalidError)
    return problem(403, 'setup-code-invalid', 'Forbidden', error.message)
  if (error instanceof OriginNotAllowedError)
    return problem(403, 'origin-not-allowed', 'Forbidden', error.message)
  if (error instanceof LocalLoginDisabledError)
    return problem(403, 'local-login-disabled', 'Forbidden', error.message)
  if (error instanceof OidcIdentityTakenError)
    return problem(409, 'identity-taken', 'Conflict', error.message)
  if (error instanceof OidcError)
    return problem(
      502,
      'identity-provider-unavailable',
      'Bad Gateway',
      'The identity provider did not answer as expected',
    )
  if (error instanceof UsernameTakenError)
    return problem(409, 'username-taken', 'Conflict', error.message)
  if (error instanceof WebhookRejectedError) {
    const slug = { 400: 'bad-request', 401: 'invalid-signature', 413: 'payload-too-large' }[
      error.status
    ]
    const title = { 400: 'Bad Request', 401: 'Unauthorized', 413: 'Content Too Large' }[
      error.status
    ]
    return problem(error.status, slug, title, error.message)
  }
  if (error instanceof InvariantViolation)
    return problem(422, 'rule-violation', 'Unprocessable Content', error.message)

  if (isResponseSerializationError(error)) return problem(500, 'internal', 'Internal Server Error')
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      ...problem(400, 'validation', 'Bad Request', 'The request did not match the expected shape'),
      errors: error.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, '').replaceAll('/', '.') || '(body)',
        message: v.message ?? 'Invalid value',
      })),
    }
  }

  const e = error as { statusCode?: unknown; code?: unknown; message?: unknown }
  const status = typeof e.statusCode === 'number' ? e.statusCode : 500
  const code = typeof e.code === 'string' ? e.code : ''
  if (status === 429)
    return problem(
      429,
      'rate-limited',
      'Too Many Requests',
      'Too many requests. Try again shortly.',
    )
  if (status >= 400 && status < 500 && code.startsWith('FST_ERR_CTP')) {
    return problem(
      status,
      'bad-request',
      status === 415 ? 'Unsupported Media Type' : 'Bad Request',
      String(e.message),
    )
  }
  // A client error raised by a plugin (for example a bad range request). Keep the status,
  // drop the message, which is not written for users.
  if (status >= 400 && status < 500) return problem(status, 'bad-request', 'Bad Request')
  return problem(500, 'internal', 'Internal Server Error')
}
