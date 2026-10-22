import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { describePermissions, parseManifest, PlanetError } from './manifest.ts'

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/hello/planet.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

const withChanges = (changes: Record<string, unknown>) => JSON.stringify({ ...fixture, ...changes })

const weather = {
  permissions: {
    network: [{ host: 'api.example.com' }],
    secrets: ['api_key'],
    storage: true,
  },
  config_schema: [{ key: 'city', label: 'City', kind: 'text', maxLength: 40, default: 'Aarhus' }],
  data_sources: [
    {
      id: 'now',
      type: 'http_poll',
      url: 'https://api.example.com/v1/{config.city}',
      headers: { authorization: 'Bearer {secret.api_key}' },
    },
  ],
}

function issuesOf(text: string) {
  try {
    parseManifest(text)
  } catch (error) {
    expect(error).toBeInstanceOf(PlanetError)
    return (error as PlanetError).issues
  }
  throw new Error('expected the manifest to be rejected')
}

describe('parseManifest', () => {
  it('accepts the fixture Planet and fills defaults', () => {
    const manifest = parseManifest(JSON.stringify(fixture))
    expect(manifest.id).toBe('dev.orbit.hello')
    expect(manifest.permissions).toEqual({
      network: [],
      secrets: [],
      storage: false,
      lan: false,
      raw_output: false,
    })
    expect(manifest.refresh.min_interval_seconds).toBe(300)
  })

  it('accepts a polling source whose host, secret and option are all declared', () => {
    const manifest = parseManifest(withChanges(weather))
    expect(describePermissions(manifest)).toEqual([
      'Network: contact api.example.com (GET)',
      'Secret: use the stored secret "api_key" in requests',
      'Storage: keep fetched data and webhook payloads',
    ])
  })

  it('points at the failing field path', () => {
    const issues = issuesOf(
      withChanges({ version: 'one', render: { ...(fixture.render as object), default_span: 9 } }),
    )
    expect(issues.map((i) => i.path).sort()).toEqual(['render.default_span', 'version'])
  })

  it.each([
    ['script', 'x.js'],
    ['wasm', 'x.wasm'],
    ['command', 'node index.js'],
    ['hooks', {}],
  ])('rejects the code-like field "%s" at the top level', (key, value) => {
    const issues = issuesOf(withChanges({ [key]: value }))
    expect(issues).toEqual([expect.objectContaining({ path: key })])
  })

  it('rejects unknown keys nested inside permissions and data sources', () => {
    expect(issuesOf(withChanges({ permissions: { exec: true } })).map((i) => i.path)).toEqual([
      'permissions.exec',
    ])
    const source = { id: 'a', type: 'static', data: 1, run: 'x' }
    expect(issuesOf(withChanges({ data_sources: [source] })).map((i) => i.path)).toEqual([
      'data_sources.0.run',
    ])
  })

  it('rejects a source type that is not a Tier 0 connector', () => {
    const issues = issuesOf(withChanges({ data_sources: [{ id: 'a', type: 'shell', cmd: 'ls' }] }))
    expect(issues[0]?.path).toBe('data_sources.0.type')
  })

  it('rejects a URL whose host is not in permissions.network', () => {
    const issues = issuesOf(
      withChanges({
        ...weather,
        permissions: {
          network: [{ host: 'other.example.com' }],
          secrets: ['api_key'],
          storage: true,
        },
      }),
    )
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'data_sources.0.url',
        message: expect.stringContaining('api.example.com'),
      }),
    ])
  })

  it('rejects a host that is built from an option, so the allowlist can be checked up front', () => {
    const source = { ...weather.data_sources[0], url: 'https://{config.city}.example.com/' }
    const issues = issuesOf(withChanges({ ...weather, data_sources: [source] }))
    expect(issues[0]?.path).toBe('data_sources.0.url')
  })

  it('refuses secrets in a URL and undeclared secrets or options anywhere', () => {
    const source = { ...weather.data_sources[0], url: 'https://api.example.com/{secret.api_key}' }
    expect(issuesOf(withChanges({ ...weather, data_sources: [source] }))[0]?.message).toContain(
      'headers',
    )
    const header = {
      ...weather.data_sources[0],
      headers: { a: '{secret.other}', b: '{config.nope}' },
    }
    expect(
      issuesOf(withChanges({ ...weather, data_sources: [header] }))
        .map((i) => i.path)
        .sort(),
    ).toEqual(['data_sources.0.headers.a', 'data_sources.0.headers.b'])
  })

  it('needs the storage permission for a webhook, and a declared secret for its HMAC', () => {
    const hook = { id: 'push', type: 'webhook', hmac_secret: 'signing' }
    const issues = issuesOf(withChanges({ data_sources: [hook] }))
    expect(issues.map((i) => i.path).sort()).toEqual([
      'data_sources.0.hmac_secret',
      'data_sources.0.type',
    ])
  })

  it('rejects ids that are not reverse-DNS and manifests for the wrong schema version', () => {
    expect(issuesOf(withChanges({ id: 'Hello' }))[0]?.path).toBe('id')
    expect(issuesOf(withChanges({ id: 'hello' }))[0]?.path).toBe('id')
    expect(issuesOf(withChanges({ schema_version: 2 }))[0]?.path).toBe('schema_version')
  })

  it('rejects text that is not JSON', () => {
    expect(() => parseManifest('{nope')).toThrow(PlanetError)
  })
})
