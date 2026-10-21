import type { Database } from './database.ts'

/** Whether any account exists. Decides if a new instance still needs its first owner. */
export function hasAccounts(db: Database): boolean {
  return db.prepare('SELECT 1 AS found FROM users LIMIT 1').get() !== undefined
}
