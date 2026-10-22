import type { DatabaseSync } from 'node:sqlite'
import type { JobScheduler, ScheduledJob } from '@orbit/application'

interface JobRow {
  id: string
  run_at: string
  payload: string
}

/** Durable jobs in the `scheduled_jobs` table. They survive a restart; a claimed job is deleted. */
export class SqliteJobScheduler implements JobScheduler {
  readonly #db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.#db = db
  }

  async schedule(job: ScheduledJob): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO scheduled_jobs (id, run_at, payload) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET run_at = excluded.run_at, payload = excluded.payload`,
      )
      .run(job.id, job.runAt.toISOString(), job.payload)
  }

  async has(id: string): Promise<boolean> {
    return (
      this.#db.prepare('SELECT 1 AS found FROM scheduled_jobs WHERE id = ?').get(id) !== undefined
    )
  }

  async claimDue(now: Date, limit: number, prefix = ''): Promise<ScheduledJob[]> {
    // One statement does the select and the delete, so two callers cannot claim the same job.
    // substr instead of LIKE, so a prefix containing % or _ is taken literally.
    const rows = this.#db
      .prepare(
        `DELETE FROM scheduled_jobs WHERE id IN (
           SELECT id FROM scheduled_jobs
           WHERE run_at <= ? AND substr(id, 1, ?) = ? ORDER BY run_at, id LIMIT ?
         ) RETURNING id, run_at, payload`,
      )
      .all(now.toISOString(), prefix.length, prefix, limit) as unknown as JobRow[]
    return rows
      .sort((a, b) => a.run_at.localeCompare(b.run_at) || a.id.localeCompare(b.id))
      .map((row) => ({ id: row.id, runAt: new Date(row.run_at), payload: row.payload }))
  }

  async cancelWithPrefix(prefix: string): Promise<void> {
    // substr instead of LIKE, so a prefix containing % or _ is taken literally.
    this.#db
      .prepare('DELETE FROM scheduled_jobs WHERE substr(id, 1, ?) = ?')
      .run(prefix.length, prefix)
  }
}
