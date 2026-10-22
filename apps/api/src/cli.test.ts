import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate, openDatabase } from '@orbit/adapter-persistence-sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctor, runCli, type CliIo } from './cli-commands.ts'
import { createSqliteServices } from './composition.ts'
import { loadConfig } from './config.ts'

const PASSWORD = 'correct horse battery'

describe('operator CLI', () => {
  let dir: string
  let dbPath: string
  let env: Record<string, string>
  let out: string[]
  let err: string[]
  let nextPassword: string
  const io = (): CliIo => ({
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    readPassword: async () => nextPassword,
  })
  const run = (...argv: string[]) => runCli(argv, env, io())

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-cli-'))
    dbPath = join(dir, 'orbit.sqlite')
    env = { ORBIT_DATABASE_PATH: dbPath, ORBIT_REGISTRATION: 'open' }
    out = []
    err = []
    nextPassword = 'a brand new passphrase'
    const db = openDatabase(dbPath)
    migrate(db)
    await createSqliteServices(db, loadConfig(env)).auth.register({
      username: 'alice',
      password: PASSWORD,
    })
    db.close()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  describe('usage', () => {
    it('prints help and succeeds when asked, fails with usage when given nothing', async () => {
      expect(await run('help')).toBe(0)
      expect(out.join('\n')).toContain('backup <file>')
      out.length = 0
      expect(await run()).toBe(2)
      expect(out.join('\n')).toContain('reset-password')
    })

    it.each([
      [['nonsense'], /Unknown command/],
      [['backup'], /exactly one argument/],
      [['backup', 'a', 'b'], /exactly one argument/],
    ])('rejects %j', async (argv, message) => {
      expect(await run(...argv)).toBe(2)
      expect(err.join('\n')).toMatch(message)
    })
  })

  describe('configuration checks', () => {
    it('validates configuration and rejects invalid settings without opening the database', async () => {
      env.ORBIT_DATABASE_PATH = join(dir, 'missing.sqlite')
      expect(await run('config', 'validate')).toBe(0)
      env.ORBIT_PORT = '99999'
      expect(await run('config', 'validate')).toBe(1)
      expect(err.join('\n')).toContain('ORBIT_PORT')
    })

    it('redacts the setup code in printed effective settings', async () => {
      env.ORBIT_SETUP_CODE = 'secret-setup-code'
      expect(await run('config', 'print', '--redacted')).toBe(0)
      const printed = out.join('\n')
      expect(printed).toContain('[REDACTED]')
      expect(printed).not.toContain(env.ORBIT_SETUP_CODE)
      expect(await run('config', 'print')).toBe(2)
    })

    it('checks storage and health, reporting failed reachability', async () => {
      const healthyResponse = new Response('{"status":"ok"}', {
        headers: { date: new Date().toUTCString() },
      })
      expect(await doctor(loadConfig(env), io(), async () => healthyResponse)).toBe(0)
      expect(out.join('\n')).toContain('storage is writable')
      err.length = 0
      expect(
        await doctor(loadConfig(env), io(), async () => {
          throw new Error('unreachable')
        }),
      ).toBe(1)
      expect(err.join('\n')).toContain('unreachable')
    })
  })

  describe('backup', () => {
    it('writes a copy that verify accepts, readable only by its owner', async () => {
      const target = join(dir, 'nested', 'dir', 'backup.sqlite')
      expect(await run('backup', target)).toBe(0)
      expect(statSync(target).mode & 0o777).toBe(0o600)
      expect(await run('verify', target)).toBe(0)
      expect(out.join('\n')).toMatch(/1 users, 0 households/)
      expect(out.join('\n')).toMatch(/OK: this backup can be restored/)
    })

    it('does not overwrite an existing backup', async () => {
      const target = join(dir, 'backup.sqlite')
      writeFileSync(target, 'precious')
      expect(await run('backup', target)).toBe(1)
      expect(err.join('\n')).toMatch(/already exists/)
    })

    it('explains a wrong database path', async () => {
      env.ORBIT_DATABASE_PATH = join(dir, 'missing.sqlite')
      expect(await run('backup', join(dir, 'b.sqlite'))).toBe(1)
      expect(err.join('\n')).toMatch(/No database at .*missing\.sqlite/)
    })
  })

  describe('verify', () => {
    it('rejects files that are missing or not databases', async () => {
      expect(await run('verify', join(dir, 'nope.sqlite'))).toBe(1)
      expect(err.join('\n')).toMatch(/No such file/)
      const junk = join(dir, 'junk.sqlite')
      writeFileSync(junk, 'not sqlite '.repeat(500))
      err.length = 0
      expect(await run('verify', junk)).toBe(1)
      expect(err.join('\n')).toMatch(/PROBLEM/)
    })

    it('works without a configured database, since the file is the argument', async () => {
      env = {}
      const target = join(dir, 'b.sqlite')
      const db = openDatabase(target)
      migrate(db)
      db.close()
      chmodSync(target, 0o600)
      expect(await run('verify', target)).toBe(0)
    })
  })

  describe('restore', () => {
    const accountCount = (path: string) => {
      const db = openDatabase(path, { readOnly: true })
      try {
        return Number(
          (db.prepare('SELECT COUNT(*) AS n FROM credentials').get() as { n: number }).n,
        )
      } finally {
        db.close()
      }
    }

    const makeBackup = async () => {
      const target = join(dir, 'backup.sqlite')
      expect(await run('backup', target)).toBe(0)
      out.length = 0
      return target
    }

    it('replaces the database with the backup and keeps the old one aside', async () => {
      const backup = await makeBackup()
      // Add a second account after the backup, then restore: it must disappear.
      const db = openDatabase(dbPath)
      await createSqliteServices(db, loadConfig(env)).auth.register({
        username: 'bobby',
        password: PASSWORD,
      })
      db.close()
      expect(accountCount(dbPath)).toBe(2)

      expect(await run('restore', backup)).toBe(0)
      expect(accountCount(dbPath)).toBe(1)
      expect(statSync(dbPath).mode & 0o777).toBe(0o600)
      const kept = readdirSync(dir).filter((f) => f.includes('.before-restore-'))
      expect(kept).toHaveLength(1)
      expect(accountCount(join(dir, kept[0]!))).toBe(2)
      expect(out.join('\n')).toMatch(/previous database was kept as/)
    })

    it('restores onto a fresh install with no database yet', async () => {
      const backup = await makeBackup()
      env.ORBIT_DATABASE_PATH = join(dir, 'fresh', 'orbit.sqlite')
      expect(await run('restore', backup)).toBe(0)
      expect(accountCount(env.ORBIT_DATABASE_PATH)).toBe(1)
    })

    it('refuses a bad backup and leaves the current database alone', async () => {
      const junk = join(dir, 'junk.sqlite')
      writeFileSync(junk, 'not sqlite '.repeat(500))
      expect(await run('restore', junk)).toBe(1)
      expect(err.join('\n')).toMatch(/Nothing was changed/)
      expect(accountCount(dbPath)).toBe(1)
      expect(readdirSync(dir).some((f) => f.includes('.before-restore-'))).toBe(false)
    })

    it('refuses a backup from a newer Orbit', async () => {
      const backup = await makeBackup()
      const db = openDatabase(backup)
      db.exec("INSERT INTO schema_migrations VALUES (999, 'future', 'now')")
      db.close()
      expect(await run('restore', backup)).toBe(1)
      expect(err.join('\n')).toMatch(/newer than this Orbit/)
    })

    it('refuses while Orbit has the database open', async () => {
      const backup = await makeBackup()
      const running = openDatabase(dbPath)
      running.prepare('SELECT COUNT(*) FROM users').get()
      expect(await run('restore', backup)).toBe(1)
      expect(err.join('\n')).toMatch(/in use\. Stop Orbit first/)
      expect(accountCount(dbPath)).toBe(1)
      running.close()
      expect(existsSync(dbPath)).toBe(true)
    })

    it('reports a missing file', async () => {
      expect(await run('restore', join(dir, 'nope.sqlite'))).toBe(1)
      expect(err.join('\n')).toMatch(/No such file/)
    })
  })

  describe('create-user', () => {
    it('creates an account even when registration is closed, and they can sign in', async () => {
      env.ORBIT_REGISTRATION = 'first-user-only'
      nextPassword = 'bobs own long passphrase'
      expect(await run('create-user', 'Bobby')).toBe(0)
      expect(out.join('\n')).toMatch(/Created bobby/)
      const db = openDatabase(dbPath)
      const auth = createSqliteServices(db, loadConfig(env)).auth
      await expect(
        auth.login({ username: 'bobby', password: 'bobs own long passphrase' }),
      ).resolves.toBeDefined()
      db.close()
    })

    it('reports a taken username and never prints the password', async () => {
      expect(await run('create-user', 'alice')).toBe(1)
      expect(err.join('\n')).toMatch(/taken/)
      expect([...out, ...err].join('\n')).not.toContain(nextPassword)
    })

    it('applies the password rules', async () => {
      nextPassword = 'short'
      expect(await run('create-user', 'bobby')).toBe(1)
      expect(err.join('\n')).toMatch(/Password must be 12 to 128/)
    })
  })

  describe('reset-password', () => {
    const loginWorks = async (password: string) => {
      const db = openDatabase(dbPath)
      try {
        await createSqliteServices(db, loadConfig(env)).auth.login({ username: 'alice', password })
        return true
      } catch {
        return false
      } finally {
        db.close()
      }
    }

    it('changes the password and ends existing sessions', async () => {
      const db = openDatabase(dbPath)
      const auth = createSqliteServices(db, loadConfig(env)).auth
      const { token } = await auth.login({ username: 'alice', password: PASSWORD })
      db.close()

      expect(await run('reset-password', 'Alice')).toBe(0)
      expect(await loginWorks(PASSWORD)).toBe(false)
      expect(await loginWorks('a brand new passphrase')).toBe(true)

      const after = openDatabase(dbPath)
      expect(
        await createSqliteServices(after, loadConfig(env)).auth.authenticate(token),
      ).toBeUndefined()
      after.close()
    })

    it('never prints the password', async () => {
      await run('reset-password', 'alice')
      expect([...out, ...err].join('\n')).not.toContain('a brand new passphrase')
    })

    it('applies the password rules and changes nothing when they fail', async () => {
      nextPassword = 'short'
      expect(await run('reset-password', 'alice')).toBe(1)
      expect(err.join('\n')).toMatch(/Password must be 12 to 128 characters/)
      expect(await loginWorks(PASSWORD)).toBe(true)
    })

    it('reports an unknown user', async () => {
      expect(await run('reset-password', 'nobody')).toBe(1)
      expect(err.join('\n')).toMatch(/No account with that username/)
    })
  })
})
