import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HouseholdId, UserId, createHousehold } from '@orbit/domain'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDatabase } from './backup.ts'
import { openDatabase } from './database.ts'
import { migrate } from './migrate.ts'
import { SqliteHouseholdRepository } from './repositories.ts'

describe('backup and restore', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orbit-backup-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('restores a live WAL database from a backup, byte-for-byte in content', async () => {
    const livePath = join(dir, 'orbit.sqlite')
    const live = openDatabase(livePath)
    migrate(live)
    const repo = new SqliteHouseholdRepository(live)
    const home = createHousehold({ id: HouseholdId('h1'), name: 'Home', ownerId: UserId('u1') })
    await repo.save(home)

    // The write may still sit in the WAL file. The backup must include it.
    const backupPath = join(dir, 'backup.sqlite')
    await backupDatabase(live, backupPath)

    // Simulate losing the live database, then restoring from the backup.
    await repo.save(
      createHousehold({ id: HouseholdId('h2'), name: 'Later', ownerId: UserId('u1') }),
    )
    live.close()
    const restored = openDatabase(backupPath)
    expect(migrate(restored)).toEqual([])
    const restoredRepo = new SqliteHouseholdRepository(restored)
    expect(await restoredRepo.get(home.id)).toEqual(home)
    expect(await restoredRepo.get(HouseholdId('h2'))).toBeUndefined()
    restored.close()
  })

  it('writes one self-contained file that opens read-only without side files', async () => {
    const live = openDatabase(join(dir, 'live.sqlite'))
    migrate(live)
    const target = join(dir, 'backup.sqlite')
    await backupDatabase(live, target)
    // Bytes 18 and 19 of the header are the file-format versions: 1 means rollback journal, 2 means WAL.
    const header = readFileSync(target)
    expect([header[18], header[19]]).toEqual([1, 1])
    // A read-only copy of the directory is the closest stand-in for a read-only mount.
    chmodSync(dir, 0o555)
    try {
      const reader = openDatabase(target, { readOnly: true })
      expect(reader.prepare('SELECT COUNT(*) AS n FROM users').get()).toEqual({ n: 0 })
      reader.close()
    } finally {
      chmodSync(dir, 0o755)
    }
    expect(readdirSync(dir).filter((f) => f.startsWith('backup.sqlite-'))).toEqual([])
    live.close()
  })

  it('refuses to overwrite an existing file', async () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const target = join(dir, 'existing.sqlite')
    writeFileSync(target, 'precious')
    await expect(backupDatabase(db, target)).rejects.toThrow(/already exists/)
  })
})
