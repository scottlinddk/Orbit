import { describe, expect, it } from 'vitest'
import { normalizeHex } from './hex.ts'

describe('normalizeHex', () => {
  it.each([
    ['#1a2b3c', '#1a2b3c'],
    ['1A2B3C', '#1a2b3c'],
    ['#ABC', '#aabbcc'],
    ['abc', '#aabbcc'],
    ['  #fff  ', '#ffffff'],
  ])('%s becomes %s', (input, expected) => {
    expect(normalizeHex(input)).toBe(expected)
  })

  it.each(['', '#', '#12', '#12345', '#1234567', 'red', 'rgb(0,0,0)', '#ggg', '##fff', '#fff;x'])(
    'rejects %j',
    (input) => {
      expect(normalizeHex(input)).toBeNull()
    },
  )
})
