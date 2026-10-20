import { z } from 'zod'

/** Path ids. The server never trusts their shape beyond length. */
export const idSchema = z.string().min(1).max(128)

/** RFC 9457 problem details. Every error response has this shape. */
export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    /** Present on validation errors: which fields failed and why. Never includes submitted values. */
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .meta({ id: 'Problem' })
export type Problem = z.infer<typeof problemSchema>

const MAX_JSON_DEPTH = 8
const MAX_JSON_NODES = 1000

/**
 * Checks, without recursion, that a value is plain JSON and small. Widget settings come from
 * clients, so size and nesting are bounded before anything stores or walks them.
 */
export function isBoundedJson(value: unknown): boolean {
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  let nodes = 0
  while (stack.length > 0) {
    const { value: v, depth } = stack.pop()!
    if (++nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return false
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return false
      continue
    }
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ value: item, depth: depth + 1 })
      continue
    }
    if (typeof v === 'object') {
      const proto = Object.getPrototypeOf(v)
      if (proto !== Object.prototype && proto !== null) return false
      for (const item of Object.values(v)) stack.push({ value: item, depth: depth + 1 })
      continue
    }
    return false
  }
  return true
}

export const widgetConfigSchema = z
  .record(z.string(), z.unknown())
  .refine(isBoundedJson, { message: 'Settings must be plain JSON, at most 8 levels deep' })
