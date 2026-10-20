import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

  it('refuses to overwrite an existing file', async () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const target = join(dir, 'existing.sqlite')
    writeFileSync(target, 'precious')
    await expect(backupDatabase(db, target)).rejects.toThrow(/already exists/)
  })
})
