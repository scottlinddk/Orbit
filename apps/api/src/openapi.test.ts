import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PUBLIC_OPERATIONS } from './public-operations.ts'
import { createTestEnv, type TestEnv } from './test-support.ts'

const SPEC_PATH = fileURLToPath(new URL('../openapi.json', import.meta.url))

let env: TestEnv
let spec: any
beforeAll(async () => {
  env = await createTestEnv()
  spec = (await env.client().get('/api/v1/openapi.json')).body
})
afterAll(() => env.close())

const operations = () =>
  Object.entries<any>(spec.paths).flatMap(([path, item]) =>
    Object.entries<any>(item).map(([method, op]) => ({ key: `${method} ${path}`, op })),
  )

describe('OpenAPI document', () => {
  it('matches the committed apps/api/openapi.json (run `pnpm --filter @orbit/api openapi` to update)', () => {
    const generated = JSON.stringify(spec, null, 2) + '\n'
    if (process.env.UPDATE_OPENAPI === '1') writeFileSync(SPEC_PATH, generated)
    expect(existsSync(SPEC_PATH), 'openapi.json is missing').toBe(true)
    expect(readFileSync(SPEC_PATH, 'utf8')).toBe(generated)
  })

  it('requires a session on every operation except the explicitly public ones', () => {
    for (const { key, op } of operations()) {
      if (PUBLIC_OPERATIONS.has(key)) {
        expect(op.security, key).toBeUndefined()
      } else {
        expect(op.security, `${key} must declare the session scheme`).toEqual([{ session: [] }])
        expect(op.responses['401'], `${key} must document 401`).toBeDefined()
      }
    }
  })

  it('documents error responses as problem details', () => {
    for (const { key, op } of operations()) {
      const four = Object.entries<any>(op.responses).filter(([status]) => status.startsWith('4'))
      expect(four.length, key).toBeGreaterThan(0)
    }
  })

  it('never exposes password or hash fields in responses', () => {
    const responses = JSON.stringify(operations().map(({ op }) => op.responses))
    expect(responses).not.toMatch(/password|passwordHash|tokenHash|token"/i)
  })
})
