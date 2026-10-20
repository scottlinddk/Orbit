import { problemSchema } from '@orbit/contracts'
import { z } from 'zod'

/** Error responses documented on routes. They all use RFC 9457 problem details. */
export const errors = {
  400: problemSchema,
  401: problemSchema,
  403: problemSchema,
  404: problemSchema,
  409: problemSchema,
  422: problemSchema,
  429: problemSchema,
} as const

export const noContent = z.null().describe('No content')
export const sessionSecurity = [{ session: [] }]
