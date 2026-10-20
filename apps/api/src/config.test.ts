import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from './config.ts'

describe('loadConfig', () => {
  it('has safe defaults: loopback only, closed registration, no proxy trust', () => {
    expect(loadConfig({})).toEqual({
      databasePath: './data/orbit.sqlite',
      host: '127.0.0.1',
      port: 3000,
      origin: 'http://localhost:3000',
      secureCookies: false,
      registration: 'first-user-only',
      trustProxy: false,
      logLevel: 'info',
    })
  })

  it('derives the origin and cookie security from the public URL', () => {
    const c = loadConfig({ ORBIT_PUBLIC_URL: 'https://orbit.example.com/some/path' })
    expect(c.origin).toBe('https://orbit.example.com')
    expect(c.secureCookies).toBe(true)
  })

  it('reads every setting', () => {
    const c = loadConfig({
      ORBIT_DATABASE_PATH: '/data/o.sqlite',
      ORBIT_HOST: '0.0.0.0',
      ORBIT_PORT: '8080',
      ORBIT_REGISTRATION: 'open',
      ORBIT_TRUST_PROXY: 'true',
      ORBIT_LOG_LEVEL: 'debug',
    })
    expect(c).toMatchObject({
      databasePath: '/data/o.sqlite',
      host: '0.0.0.0',
      port: 8080,
      registration: 'open',
      trustProxy: true,
      logLevel: 'debug',
    })
  })

  it.each([
    ['ORBIT_PORT', '0'],
    ['ORBIT_PORT', 'abc'],
    ['ORBIT_PORT', '70000'],
    ['ORBIT_PUBLIC_URL', 'ftp://example.com'],
    ['ORBIT_PUBLIC_URL', 'not a url'],
    ['ORBIT_REGISTRATION', 'maybe'],
    ['ORBIT_TRUST_PROXY', 'yes'],
  ])('rejects %s=%s with a readable message', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError)
    expect(() => loadConfig({ [key]: value })).toThrow(new RegExp(key))
  })
})
