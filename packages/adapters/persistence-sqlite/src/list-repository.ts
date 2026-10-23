import type { ListRepository } from '@orbit/application'
import {
  HouseholdId,
  ListId,
  ListItemId,
  UserId,
  type HouseholdList,
  type HouseholdListItem,
  type ListKind,
} from '@orbit/domain'
import { inTransaction, type Database } from './database.ts'

type Row = Record<string, string | number | null>

export class SqliteListRepository implements ListRepository {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async createList(list: HouseholdList): Promise<void> {
    this.#db
      .prepare(
        'INSERT INTO lists (id, household_id, name, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        list.id,
        list.householdId,
        list.name,
        list.kind,
        list.createdBy,
        list.createdAt.toISOString(),
      )
  }

  async getList(id: ListId): Promise<HouseholdList | undefined> {
    const row = this.#db.prepare(`${SELECT_LIST} WHERE id = ?`).get(id) as Row | undefined
    return row && hydrateList(row)
  }

  async saveList(list: HouseholdList): Promise<void> {
    this.#db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(list.name, list.id)
  }

  async listsForHousehold(householdId: HouseholdId): Promise<HouseholdList[]> {
    const rows = this.#db
      .prepare(`${SELECT_LIST} WHERE household_id = ? ORDER BY rowid`)
      .all(householdId) as Row[]
    return rows.map(hydrateList)
  }

  async deleteList(id: ListId): Promise<void> {
    // The items go with it through ON DELETE CASCADE.
    this.#db.prepare('DELETE FROM lists WHERE id = ?').run(id)
  }

  async items(listId: ListId): Promise<HouseholdListItem[]> {
    const rows = this.#db
      .prepare(`${SELECT_ITEM} WHERE list_id = ? ORDER BY position, rowid`)
      .all(listId) as Row[]
    return rows.map(hydrateItem)
  }

  async getItem(id: ListItemId): Promise<HouseholdListItem | undefined> {
    const row = this.#db.prepare(`${SELECT_ITEM} WHERE id = ?`).get(id) as Row | undefined
    return row && hydrateItem(row)
  }

  async saveItems(items: readonly HouseholdListItem[]): Promise<void> {
    const upsert = this.#db.prepare(
      `INSERT INTO list_items
         (id, list_id, text, done, quantity, note, position,
          created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         text = excluded.text, done = excluded.done, quantity = excluded.quantity,
         note = excluded.note, position = excluded.position,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    inTransaction(this.#db, () => {
      for (const i of items)
        upsert.run(
          i.id,
          i.listId,
          i.text,
          i.done ? 1 : 0,
          i.quantity ?? null,
          i.note ?? null,
          i.position,
          i.createdBy,
          i.createdAt.toISOString(),
          i.updatedBy,
          i.updatedAt.toISOString(),
        )
    })
  }

  async deleteItem(id: ListItemId): Promise<void> {
    this.#db.prepare('DELETE FROM list_items WHERE id = ?').run(id)
  }

  async deleteCompleted(listId: ListId): Promise<number> {
    const result = this.#db
      .prepare('DELETE FROM list_items WHERE list_id = ? AND done = 1')
      .run(listId)
    return Number(result.changes)
  }
}

const SELECT_LIST = 'SELECT id, household_id, name, kind, created_by, created_at FROM lists'

function hydrateList(row: Row): HouseholdList {
  return {
    id: ListId(String(row.id)),
    householdId: HouseholdId(String(row.household_id)),
    name: String(row.name),
    kind: String(row.kind) as ListKind,
    createdBy: UserId(String(row.created_by)),
    createdAt: new Date(String(row.created_at)),
  }
}

const SELECT_ITEM = `SELECT id, list_id, text, done, quantity, note, position, created_by,
  created_at, updated_by, updated_at FROM list_items`

function hydrateItem(row: Row): HouseholdListItem {
  return {
    id: ListItemId(String(row.id)),
    listId: ListId(String(row.list_id)),
    text: String(row.text),
    done: row.done === 1,
    ...(row.quantity === null ? {} : { quantity: String(row.quantity) }),
    ...(row.note === null ? {} : { note: String(row.note) }),
    position: Number(row.position),
    createdBy: UserId(String(row.created_by)),
    createdAt: new Date(String(row.created_at)),
    updatedBy: UserId(String(row.updated_by)),
    updatedAt: new Date(String(row.updated_at)),
  }
}
