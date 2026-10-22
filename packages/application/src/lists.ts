import {
  ListId,
  ListItemId,
  MAX_LISTS_PER_HOUSEHOLD,
  addListItem,
  createList,
  InvariantViolation,
  invariant,
  moveListItem,
  renameList,
  updateListItem,
  type HouseholdId,
  type HouseholdList,
  type HouseholdListItem,
  type ListKind,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import type { Clock } from './auth-ports.ts'
import type { Authorizer } from './authorizer.ts'
import { NotFoundError } from './errors.ts'
import type { NotificationEventSink } from './notifications.ts'
import type { IdGenerator, ListRepository } from './ports.ts'

export interface ListDetail {
  readonly list: HouseholdList
  /** In display (position) order. Done items stay where they are. */
  readonly items: readonly HouseholdListItem[]
  /** Mirrored lists only: why the last refresh failed. The items shown are then the last good ones. */
  readonly syncError?: string
}

export interface ListSummary {
  readonly list: HouseholdList
  readonly openCount: number
  readonly itemCount: number
  readonly syncError?: string
}

/**
 * Lists mirrored from other systems (ADR 0019). They are never stored in the list tables, so
 * they are read here and nowhere else. They are read only: every change is refused.
 */
export interface ExternalLists {
  /** Whether an id has the shape of a mirrored list. It may still not exist in this household. */
  owns(id: string): boolean
  summaries(householdId: HouseholdId): Promise<ListSummary[]>
  /** `undefined` when no such mirrored list exists in the household. */
  detail(householdId: HouseholdId, id: string): Promise<ListDetail | undefined>
}

export interface ListUseCaseDependencies {
  lists: ListRepository
  authorizer: Authorizer
  clock: Clock
  ids: IdGenerator
  external?: ExternalLists | undefined
  /** Told when an item is added or ticked off. Never makes the edit fail. */
  events?: NotificationEventSink | undefined
}

/**
 * Household lists. Every operation names the household in its path and the list is looked up
 * inside it, so another household's list or item id is indistinguishable from a missing one.
 * Edits are last-write-wins per item: there is no version check, because two people ticking off
 * different items, or the same one, should never see a conflict dialog at the shop.
 */
export function createListUseCases(deps: ListUseCaseDependencies) {
  const { lists, authorizer, clock, ids, external, events } = deps

  /**
   * A mirrored list answers "read only" to any change, but only to someone who may edit lists
   * and only when it really belongs to this household. Anyone else gets the usual 404.
   */
  async function refuseIfMirrored(householdId: HouseholdId, listId: ListId): Promise<void> {
    if (external?.owns(listId) && (await external.detail(householdId, listId)))
      throw new InvariantViolation(
        'This list is mirrored from another system and is read only here. Change it there.',
      )
  }

  async function loadList(
    actor: Actor,
    householdId: HouseholdId,
    listId: ListId,
    action: 'list:view' | 'list:edit',
  ): Promise<HouseholdList> {
    await authorizer.require(actor, householdId, action)
    if (action === 'list:edit') await refuseIfMirrored(householdId, listId)
    const list = await lists.getList(listId)
    if (!list || list.householdId !== householdId) throw new NotFoundError()
    return list
  }

  async function detail(list: HouseholdList): Promise<ListDetail> {
    return { list, items: await lists.items(list.id) }
  }

  async function loadItem(list: HouseholdList, itemId: ListItemId): Promise<HouseholdListItem> {
    const item = await lists.getItem(itemId)
    if (!item || item.listId !== list.id) throw new NotFoundError()
    return item
  }

  return {
    async createList(
      actor: Actor,
      householdId: HouseholdId,
      input: { name: string; kind: ListKind },
    ): Promise<ListDetail> {
      await authorizer.require(actor, householdId, 'list:edit')
      invariant(
        (await lists.listsForHousehold(householdId)).length < MAX_LISTS_PER_HOUSEHOLD,
        `A household has at most ${MAX_LISTS_PER_HOUSEHOLD} lists`,
      )
      const list = createList({
        id: ListId(ids.next()),
        householdId,
        name: input.name,
        kind: input.kind,
        createdBy: actor.userId,
        now: clock.now(),
      })
      await lists.createList(list)
      return { list, items: [] }
    },

    async listLists(actor: Actor, householdId: HouseholdId): Promise<ListSummary[]> {
      await authorizer.require(actor, householdId, 'list:view')
      const all = await lists.listsForHousehold(householdId)
      const own = await Promise.all(
        all.map(async (list) => {
          const items = await lists.items(list.id)
          return {
            list,
            itemCount: items.length,
            openCount: items.filter((i) => !i.done).length,
          }
        }),
      )
      return [...own, ...((await external?.summaries(householdId)) ?? [])]
    },

    async getList(actor: Actor, householdId: HouseholdId, listId: ListId): Promise<ListDetail> {
      await authorizer.require(actor, householdId, 'list:view')
      if (external?.owns(listId)) {
        const mirrored = await external.detail(householdId, listId)
        if (mirrored) return mirrored
      }
      return detail(await loadList(actor, householdId, listId, 'list:view'))
    },

    async renameList(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
      name: string,
    ): Promise<ListDetail> {
      const renamed = renameList(await loadList(actor, householdId, listId, 'list:edit'), name)
      await lists.saveList(renamed)
      return detail(renamed)
    },

    async deleteList(actor: Actor, householdId: HouseholdId, listId: ListId): Promise<void> {
      await loadList(actor, householdId, listId, 'list:edit')
      await lists.deleteList(listId)
    },

    async addListItem(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
      input: { text: string; quantity?: string | undefined; note?: string | undefined },
    ): Promise<ListDetail> {
      const list = await loadList(actor, householdId, listId, 'list:edit')
      const current = await lists.items(listId)
      const item = addListItem(current, {
        id: ListItemId(ids.next()),
        listId,
        ...input,
        by: actor.userId,
        now: clock.now(),
      })
      await lists.saveItems([item])
      events?.publish(householdId, 'list.item.added', {
        listId: list.id,
        listName: list.name,
        itemId: item.id,
        text: item.text,
        ...(item.quantity === undefined ? {} : { quantity: item.quantity }),
      })
      return { list, items: [...current, item] }
    },

    /** Edits text, quantity or note, and ticks an item on or off. Only given fields change. */
    async updateListItem(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
      itemId: ListItemId,
      change: {
        text?: string | undefined
        done?: boolean | undefined
        quantity?: string | null | undefined
        note?: string | null | undefined
      },
    ): Promise<ListDetail> {
      const list = await loadList(actor, householdId, listId, 'list:edit')
      const before = await loadItem(list, itemId)
      const updated = updateListItem(before, change, actor.userId, clock.now())
      await lists.saveItems([updated])
      if (!before.done && updated.done)
        events?.publish(householdId, 'list.item.completed', {
          listId: list.id,
          listName: list.name,
          itemId: updated.id,
          text: updated.text,
        })
      return detail(list)
    },

    async deleteListItem(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
      itemId: ListItemId,
    ): Promise<ListDetail> {
      const list = await loadList(actor, householdId, listId, 'list:edit')
      await loadItem(list, itemId)
      await lists.deleteItem(itemId)
      return detail(list)
    },

    async moveListItem(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
      itemId: ListItemId,
      toIndex: number,
    ): Promise<ListDetail> {
      const list = await loadList(actor, householdId, listId, 'list:edit')
      await loadItem(list, itemId)
      const changed = moveListItem(await lists.items(listId), itemId, toIndex)
      if (changed.length > 0) await lists.saveItems(changed)
      return detail(list)
    },

    /** Removes every ticked-off item at once. */
    async clearCompletedListItems(
      actor: Actor,
      householdId: HouseholdId,
      listId: ListId,
    ): Promise<ListDetail> {
      const list = await loadList(actor, householdId, listId, 'list:edit')
      await lists.deleteCompleted(listId)
      return detail(list)
    },
  }
}
