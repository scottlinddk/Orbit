import { describe, expect, it } from 'vitest'
import { isBoundedJson } from './index.ts'

const nested = (depth: number): unknown => {
  let value: unknown = 1
  for (let i = 0; i < depth; i++) value = { a: value }
  return value
}

describe('isBoundedJson', () => {
  it('accepts ordinary settings', () => {
    expect(isBoundedJson({ days: 7, list: ['a', 1, null, true], deep: { ok: { fine: 1 } } })).toBe(
      true,
    )
  })

  it('rejects values JSON cannot carry', () => {
    for (const bad of [undefined, () => 1, Symbol('x'), 1n, NaN, Infinity, new Date(), new Map()]) {
      expect(isBoundedJson({ bad })).toBe(false)
    }
  })

  it('rejects excessive depth without recursing', () => {
    expect(isBoundedJson(nested(8))).toBe(true)
    expect(isBoundedJson(nested(9))).toBe(false)
    expect(isBoundedJson(nested(100_000))).toBe(false)
  })

  it('rejects too many nodes', () => {
    expect(isBoundedJson({ items: new Array(2000).fill(0) })).toBe(false)
  })
})
