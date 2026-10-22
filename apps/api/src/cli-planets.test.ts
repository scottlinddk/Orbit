import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runCli, type CliIo } from './cli-commands.ts'

const FIXTURE = new URL('../../../packages/modules/planets/fixtures/hello', import.meta.url)
  .pathname
const KEY = 'k'.repeat(40)

describe('orbit planet', () => {
  let dir: string
  let env: Record<string, string>
  let out: string[]
  let err: string[]
  let answer: boolean | undefined
  let secret: string
  const io = (): CliIo => ({
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    readPassword: async () => 'unused',
    readSecret: async () => secret,
    ...(answer === undefined ? {} : { confirm: async () => answer as boolean }),
  })
  const run = (...argv: string[]) => runCli(argv, env, io())

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-cli-planets-'))
    env = {
      ORBIT_DATABASE_PATH: join(dir, 'orbit.sqlite'),
      ORBIT_SECRET_KEY: KEY,
      ORBIT_PUBLIC_URL: 'https://orbit.example.com',
    }
    out = []
    err = []
    answer = undefined
    secret = ''
    const db = openDatabase(env.ORBIT_DATABASE_PATH ?? '')
    migrate(db)
    db.close()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists every permission and refuses to install without approval', async () => {
    expect(await run('planet', 'install', FIXTURE)).toBe(1)
    expect(out.join('\n')).toContain('None: this Planet uses only data inside its own files.')
    expect(err.join('\n')).toContain('--yes')
    expect(existsSync(join(dir, 'planets', 'planets.lock'))).toBe(false)

    out.length = 0
    answer = false
    expect(await run('planet', 'install', FIXTURE)).toBe(1)
    expect(existsSync(join(dir, 'planets', 'planets.lock'))).toBe(false)
  })

  it('installs after a yes, lists it, and uninstalls it', async () => {
    answer = true
    expect(await run('planet', 'install', FIXTURE)).toBe(0)
    expect(out.join('\n')).toContain('Installed dev.orbit.hello 1.0.0')

    out.length = 0
    expect(await run('planet', 'list')).toBe(0)
    expect(out.join('\n')).toMatch(/dev\.orbit\.hello 1\.0\.0 +sha256:/)

    out.length = 0
    expect(await run('planet', 'uninstall', 'dev.orbit.hello')).toBe(0)
    expect(existsSync(join(dir, 'planets', 'installed', 'dev.orbit.hello'))).toBe(false)
    expect(await run('planet', 'list')).toBe(0)
    expect(out.join('\n')).toContain('No Planets are installed.')
  })

  it('--yes approves without asking', async () => {
    expect(await run('planet', 'install', FIXTURE, '--yes')).toBe(0)
  })

  it('reports a bad manifest with the failing field path', async () => {
    const bad = join(dir, 'bad')
    cpSync(FIXTURE, bad, { recursive: true })
    const file = join(bad, 'planet.json')
    writeFileSync(
      file,
      JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), version: 'x', exec: 'ls' }),
    )
    expect(await run('planet', 'install', bad, '--yes')).toBe(1)
    expect(err.join('\n')).toMatch(/version: .*SemVer/)
    expect(err.join('\n')).toMatch(/exec: is not a known field/)
  })

  it('flags a Planet changed after install when listing', async () => {
    await run('planet', 'install', FIXTURE, '--yes')
    writeFileSync(
      join(dir, 'planets', 'installed', 'dev.orbit.hello', 'templates', 'main.liquid'),
      'x',
    )
    out.length = 0
    expect(await run('planet', 'list')).toBe(1)
    expect(out.join('\n')).toContain('NOT LOADED')
  })

  describe('secrets and webhooks', () => {
    const planet = () => {
      const folder = join(dir, 'secretive')
      mkdirSync(join(folder, 'templates'), { recursive: true })
      writeFileSync(
        join(folder, 'planet.json'),
        JSON.stringify({
          schema_version: 1,
          id: 'dev.test.secretive',
          version: '1.0.0',
          name: 'Secretive',
          authors: ['T'],
          license: 'MIT',
          orbit: '*',
          permissions: { secrets: ['api_key'], storage: true },
          data_sources: [{ id: 'push', type: 'webhook' }],
          render: { title: 'S', description: 'S.', template: 'templates/main.liquid' },
        }),
      )
      writeFileSync(join(folder, 'templates', 'main.liquid'), 'x')
      return folder
    }

    it('stores a declared secret encrypted and refuses an undeclared or short one', async () => {
      await run('planet', 'install', planet(), '--yes')
      secret = 'a-long-enough-key'
      expect(await run('planet', 'secret', 'set', 'dev.test.secretive', 'api_key')).toBe(0)
      const db = openDatabase(env.ORBIT_DATABASE_PATH ?? '')
      const rows = JSON.stringify(db.prepare('SELECT * FROM secrets').all())
      db.close()
      expect(rows).toContain('planet:dev.test.secretive')
      expect(rows).not.toContain('a-long-enough-key')

      err.length = 0
      expect(await run('planet', 'secret', 'set', 'dev.test.secretive', 'other')).toBe(1)
      secret = 'short'
      expect(await run('planet', 'secret', 'set', 'dev.test.secretive', 'api_key')).toBe(1)
    })

    it('needs the master key before it stores a secret', async () => {
      await run('planet', 'install', planet(), '--yes')
      delete env.ORBIT_SECRET_KEY
      secret = 'a-long-enough-key'
      expect(await run('planet', 'secret', 'set', 'dev.test.secretive', 'api_key')).toBe(1)
      expect(err.join('\n')).toContain('ORBIT_SECRET_KEY')
    })

    it('prints a webhook URL once, and removes every trace on uninstall', async () => {
      await run('planet', 'install', planet(), '--yes')
      secret = 'a-long-enough-key'
      await run('planet', 'secret', 'set', 'dev.test.secretive', 'api_key')
      out.length = 0
      expect(await run('planet', 'webhook', 'dev.test.secretive', 'w1', 'push')).toBe(0)
      expect(out[0]).toMatch(
        /^https:\/\/orbit\.example\.com\/api\/v1\/planet-hooks\/[A-Za-z0-9_-]{43}$/,
      )

      const count = (table: string) => {
        const db = openDatabase(env.ORBIT_DATABASE_PATH ?? '')
        try {
          return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
        } finally {
          db.close()
        }
      }
      expect(count('planet_webhooks')).toBe(1)
      expect(count('secrets')).toBe(1)

      expect(await run('planet', 'uninstall', 'dev.test.secretive')).toBe(0)
      expect(count('planet_webhooks')).toBe(0)
      expect(count('secrets')).toBe(0)
      expect(count('planet_state')).toBe(0)
      expect(count('scheduled_jobs')).toBe(0)
    })

    it('does not make a webhook for a source that does not exist', async () => {
      await run('planet', 'install', planet(), '--yes')
      expect(await run('planet', 'webhook', 'dev.test.secretive', 'w1', 'nope')).toBe(1)
    })
  })

  it('shows usage for an unknown subcommand', async () => {
    expect(await run('planet', 'frobnicate')).toBe(2)
    expect(err.join('\n')).toContain('planet install')
  })

  it('config print --redacted hides the master key', async () => {
    expect(await run('config', 'print', '--redacted')).toBe(0)
    expect(out.join('\n')).not.toContain(KEY)
    expect(out.join('\n')).toContain('[REDACTED]')
  })
})
