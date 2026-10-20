import { problemSchema, type Problem } from '@orbit/contracts'
import type { ZodType } from 'zod'

const BASE = '/api/v1'

/** A failed API call. `problem` holds the server's RFC 9457 body when there was one. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: Problem | undefined

  constructor(status: number, message: string, problem?: Problem) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

interface RequestOptions<T> {
  body?: unknown
  /** Validates the response. Without it the call must return no content. */
  schema?: ZodType<T>
}

export async function request<T = void>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  { body, schema }: RequestOptions<T> = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204 || !schema) return undefined as T

  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success)
    throw new ApiError(response.status, 'The server sent a response this app does not understand.')
  return parsed.data
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = problemSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) return new ApiError(response.status, `Request failed (${response.status}).`)
  const { detail, title, errors } = parsed.data
  const fields = errors?.map((e) => `${e.path}: ${e.message}`).join('. ')
  return new ApiError(response.status, fields || detail || title, parsed.data)
}
