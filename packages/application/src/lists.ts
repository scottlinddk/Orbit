import {
  ListId,
  ListItemId,
  MAX_LISTS_PER_HOUSEHOLD,
  addListItem,
  createList,
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
import type { IdGenerator, ListRepository } from './ports.ts'

export interface ListDetail {
  readonly list: HouseholdList
  /** In display (position) order. Done items stay where they are. */
  readonly items: readonly HouseholdListItem[]
}

export interface ListSummary {
  readonly list: HouseholdList
  readonly openCount: number
  readonly itemCount: number
}

export interface ListUseCaseDependencies {
  lists: ListRepository
  authorizer: Authorizer
  clock: Clock
  ids: IdGenerator
}

/**
 * Household lists. Every operation names the household in its path and the list is looked up
 * inside it, so another household's list or item id is indistinguishable from a missing one.
 * Edits are last-write-wins per item: there is no version check, because two people ticking off
 * different items, or the same one, should never see a conflict dialog at the shop.
 */
export function createListUseCases(deps: ListUseCaseDependencies) {
  const { lists, authorizer, clock, ids } = deps

  async function loadList(
    actor: Actor,
    householdId: HouseholdId,
    listId: ListId,
    action: 'list:view' | 'list:edit',
  ): Promise<HouseholdList> {
    await authorizer.require(actor, householdId, action)
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
      return Promise.all(
        all.map(async (list) => {
          const items = await lists.items(list.id)
          return {
            list,
            itemCount: items.length,
            openCount: items.filter((i) => !i.done).length,
          }
        }),
      )
    },

    async getList(actor: Actor, householdId: HouseholdId, listId: ListId): Promise<ListDetail> {
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
      const updated = updateListItem(
        await loadItem(list, itemId),
        change,
        actor.userId,
        clock.now(),
      )
      await lists.saveItems([updated])
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
