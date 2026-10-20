import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { API_CSP, WEB_CSP } from './http/web.ts'
import { createTestEnv, type TestEnv } from './test-support.ts'

let dir: string
let env: TestEnv
const HTML = { accept: 'text/html,application/xhtml+xml' }

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'orbit-web-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Orbit</title><div id="root"></div>')
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log("app")')
  writeFileSync(join(dir, '.secret'), 'do not serve')
  env = await createTestEnv({ app: { webDir: dir } })
})
afterAll(async () => {
  await env.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('serving the web app', () => {
  it('serves the app shell at the root', async () => {
    const res = await env.client().get('/', HTML)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.raw.body).toContain('<div id="root">')
  })

  it.each(['/d/abc', '/h/xyz', '/login', '/some/deep/client/route'])(
    'answers a browser navigation to %s with the app shell',
    async (path) => {
      const res = await env.client().get(path, HTML)
      expect(res.status).toBe(200)
      expect(res.raw.body).toContain('<div id="root">')
    },
  )

  it('never answers a missing script or image with HTML', async () => {
    for (const path of ['/assets/missing.js', '/nope.png']) {
      const res = await env.client().get(path, { accept: '*/*' })
      expect(res.status, path).toBe(404)
      expect(res.headers['content-type']).toContain('application/problem+json')
    }
  })

  it('keeps unknown API paths as JSON 404s, even for a browser', async () => {
    const res = await env.client().get('/api/v1/nope', HTML)
    expect(res.status).toBe(404)
    expect(res.body.type).toBe('urn:orbit:problem:not-found')
  })

  it('does not turn a failed write into the app shell', async () => {
    const res = await env.client().post('/d/abc', { x: 1 }, HTML)
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
  })

  it('refuses dotfiles and path traversal', async () => {
    for (const path of [
      '/.secret',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/assets/..%2f..%2f.secret',
      '/..%2f.secret',
    ]) {
      const res = await env.client().get(path, { accept: '*/*' })
      expect(res.status, path).toBe(404)
      expect(res.raw.body, path).not.toContain('do not serve')
    }
  })
})

describe('headers', () => {
  it('caches fingerprinted assets forever and the shell never', async () => {
    const asset = await env.client().get('/assets/app-abc123.js')
    expect(asset.status).toBe(200)
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const shell = await env.client().get('/', HTML)
    expect(shell.headers['cache-control']).toBe('no-cache')
    const route = await env.client().get('/d/abc', HTML)
    expect(route.headers['cache-control']).toBe('no-cache')
  })

  it('gives the web app its own strict policy and the API an empty one', async () => {
    const page = await env.client().get('/', HTML)
    expect(page.headers['content-security-policy']).toBe(WEB_CSP)
    const api = await env.client().get('/api/v1/health')
    expect(api.headers['content-security-policy']).toBe(API_CSP)
    expect(api.headers['cache-control']).toBe('no-store')
  })

  it('keeps the web policy free of unsafe-inline, unsafe-eval and wildcards', () => {
    expect(WEB_CSP).not.toMatch(/unsafe-|\*/)
    expect(WEB_CSP).toContain("script-src 'self'")
    expect(WEB_CSP).toContain("frame-ancestors 'none'")
  })

  it('sends the usual hardening headers on web responses too', async () => {
    const res = await env.client().get('/', HTML)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })
})

describe('health check', () => {
  it('is public, minimal and uncached', async () => {
    const res = await env.client().get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('without a web app configured', () => {
  it('stays an API: the root is a JSON 404', async () => {
    const api = await createTestEnv()
    const res = await api.client().get('/', HTML)
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toContain('application/problem+json')
    await api.close()
  })
})
