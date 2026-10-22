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
      setupCode: undefined,
      trustProxy: false,
      webDir: undefined,
      migrationSnapshots: 5,
      backupIntervalMs: 24 * 60 * 60 * 1000,
      backupKeep: 14,
      secretKey: undefined,
      planetsDir: 'data/planets',
      egressAllowPrivateHosts: new Set(),
      timeZone: 'UTC',
      oidc: undefined,
      localLogin: true,
      logLevel: 'info',
    })
  })

  it('reads the time zone for the display feed and refuses an unknown one', () => {
    expect(loadConfig({ ORBIT_TIME_ZONE: 'Europe/Copenhagen' }).timeZone).toBe('Europe/Copenhagen')
    expect(() => loadConfig({ ORBIT_TIME_ZONE: 'Mars/Olympus' })).toThrow(/ORBIT_TIME_ZONE/)
  })

  it('treats an empty setup code as unset', () => {
    expect(loadConfig({ ORBIT_SETUP_CODE: '' }).setupCode).toBeUndefined()
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
      ORBIT_WEB_DIR: '/app/web',
      ORBIT_MIGRATION_SNAPSHOTS: '2',
      ORBIT_BACKUP_INTERVAL_HOURS: '6',
      ORBIT_BACKUP_KEEP: '30',
      ORBIT_SETUP_CODE: 'a-long-code-of-mine',
    })
    expect(c).toMatchObject({
      databasePath: '/data/o.sqlite',
      host: '0.0.0.0',
      port: 8080,
      registration: 'open',
      trustProxy: true,
      logLevel: 'debug',
      webDir: '/app/web',
      migrationSnapshots: 2,
      backupIntervalMs: 6 * 60 * 60 * 1000,
      backupKeep: 30,
      setupCode: 'a-long-code-of-mine',
    })
  })

  it.each([
    ['ORBIT_MIGRATION_SNAPSHOTS', '0'],
    ['ORBIT_BACKUP_INTERVAL_HOURS', '-1'],
    ['ORBIT_BACKUP_INTERVAL_HOURS', '1.5'],
    ['ORBIT_BACKUP_KEEP', '0'],
    ['ORBIT_SETUP_CODE', 'short'],
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

  describe('OpenID Connect', () => {
    const oidc = {
      ORBIT_PUBLIC_URL: 'https://orbit.example.com/ignored/path',
      ORBIT_OIDC_ISSUER: 'https://id.example.com/realms/home',
      ORBIT_OIDC_CLIENT_ID: 'orbit',
      ORBIT_OIDC_CLIENT_SECRET: 'shh',
    }

    it('is off by default and on when issuer, client id and secret are set', () => {
      expect(loadConfig({}).oidc).toBeUndefined()
      expect(loadConfig(oidc).oidc).toEqual({
        issuer: 'https://id.example.com/realms/home',
        clientId: 'orbit',
        clientSecret: 'shh',
        scopes: ['openid', 'profile'],
        label: 'Single sign-on',
        redirectUri: 'https://orbit.example.com/api/v1/auth/oidc/callback',
        allowHttp: false,
      })
    })

    it('always asks for openid and drops duplicates', () => {
      const c = loadConfig({ ...oidc, ORBIT_OIDC_SCOPES: 'email  profile email' })
      expect(c.oidc?.scopes).toEqual(['openid', 'email', 'profile'])
    })

    it('needs all three settings, or none', () => {
      for (const missing of [
        'ORBIT_OIDC_ISSUER',
        'ORBIT_OIDC_CLIENT_ID',
        'ORBIT_OIDC_CLIENT_SECRET',
      ]) {
        const partial: Record<string, string> = { ...oidc }
        delete partial[missing]
        expect(() => loadConfig(partial)).toThrow(/must all be set/)
      }
    })

    it('treats empty values from Compose as unset', () => {
      const empty = {
        ORBIT_OIDC_ISSUER: '',
        ORBIT_OIDC_CLIENT_ID: '',
        ORBIT_OIDC_CLIENT_SECRET: '',
      }
      expect(loadConfig(empty).oidc).toBeUndefined()
    })

    it('allows an http issuer only for a host the administrator listed', () => {
      const lan = { ...oidc, ORBIT_OIDC_ISSUER: 'http://auth.lan:9000/application/o/orbit/' }
      expect(() => loadConfig(lan)).toThrow(/ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS/)
      const allowed = loadConfig({ ...lan, ORBIT_EGRESS_ALLOW_PRIVATE_HOSTS: 'auth.lan' })
      expect(allowed.oidc?.allowHttp).toBe(true)
    })

    it('turns password sign-in off only when OIDC is configured', () => {
      expect(() => loadConfig({ ORBIT_LOCAL_LOGIN: 'disabled' })).toThrow(ConfigError)
      expect(loadConfig({ ...oidc, ORBIT_LOCAL_LOGIN: 'disabled' }).localLogin).toBe(false)
      expect(loadConfig({}).localLogin).toBe(true)
    })

    it('rejects an unknown ORBIT_LOCAL_LOGIN value', () => {
      expect(() => loadConfig({ ORBIT_LOCAL_LOGIN: 'maybe' })).toThrow(ConfigError)
    })
  })
})
