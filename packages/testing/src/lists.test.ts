import { NotFoundError, type Actor } from '@orbit/application'
import {
  InvariantViolation,
  ListItemId,
  MAX_LISTS_PER_HOUSEHOLD,
  type HouseholdId,
  type ListId,
} from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemorySystem, createSqliteSystem, type TestSystem } from './fixtures.ts'

describe.each([
  ['in-memory', createInMemorySystem],
  ['sqlite', createSqliteSystem],
])('household lists: %s', (_name, create) => {
  let sys: TestSystem
  let alice: Actor
  let bob: Actor
  let household: HouseholdId
  let listId: ListId

  beforeEach(async () => {
    sys = create()
    alice = await sys.newActor('alice')
    bob = await sys.newActor('bob')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
    await sys.useCases.addHouseholdMember(alice, household, { userId: bob.userId })
    listId = (
      await sys.useCases.createList(alice, household, { name: 'Groceries', kind: 'shopping' })
    ).list.id
  })

  const itemIds = async (as = alice) =>
    (await sys.useCases.getList(as, household, listId)).items.map((i) => i.text)

  it('lets any member create, fill and tick off a shared list', async () => {
    const { useCases: uc } = sys
    await uc.addListItem(alice, household, listId, { text: 'Milk', quantity: '2 l' })
    const afterBob = await uc.addListItem(bob, household, listId, { text: 'Bread', note: 'rye' })
    expect(afterBob.items.map((i) => i.text)).toEqual(['Milk', 'Bread'])
    expect(afterBob.items[1]).toMatchObject({ createdBy: bob.userId, note: 'rye' })

    const milk = afterBob.items[0]!
    const ticked = await uc.updateListItem(bob, household, listId, milk.id, { done: true })
    expect(ticked.items[0]).toMatchObject({ done: true, updatedBy: bob.userId })
    expect(ticked.items[0]!.createdBy).toBe(alice.userId)
  })

  it('summarizes lists with how many items are open', async () => {
    const { useCases: uc } = sys
    const list = await uc.addListItem(alice, household, listId, { text: 'Milk' })
    await uc.addListItem(alice, household, listId, { text: 'Bread' })
    await uc.updateListItem(alice, household, listId, list.items[0]!.id, { done: true })
    await uc.createList(bob, household, { name: 'Chores', kind: 'todo' })
    const summaries = await uc.listLists(bob, household)
    expect(summaries.map((s) => [s.list.name, s.openCount, s.itemCount])).toEqual([
      ['Groceries', 1, 2],
      ['Chores', 0, 0],
    ])
  })

  it('renames, moves, deletes items and clears completed ones', async () => {
    const { useCases: uc } = sys
    for (const text of ['a', 'b', 'c', 'd'])
      await uc.addListItem(alice, household, listId, { text })
    const [a, b, c, d] = (await uc.getList(alice, household, listId)).items
    expect((await uc.renameList(bob, household, listId, 'Weekend')).list.name).toBe('Weekend')

    await uc.moveListItem(alice, household, listId, d!.id, 0)
    expect(await itemIds()).toEqual(['d', 'a', 'b', 'c'])

    await uc.updateListItem(alice, household, listId, a!.id, { done: true })
    await uc.updateListItem(alice, household, listId, c!.id, { done: true })
    await uc.deleteListItem(alice, household, listId, b!.id)
    const cleared = await uc.clearCompletedListItems(bob, household, listId)
    expect(cleared.items.map((i) => i.text)).toEqual(['d'])

    // New items go to the end even after deletions left gaps.
    const added = await uc.addListItem(alice, household, listId, { text: 'e' })
    expect(added.items.map((i) => i.text)).toEqual(['d', 'e'])
  })

  it('deletes a list with its items', async () => {
    const { useCases: uc } = sys
    const item = (await uc.addListItem(alice, household, listId, { text: 'Milk' })).items[0]!
    await uc.deleteList(bob, household, listId)
    await expect(uc.getList(alice, household, listId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      uc.updateListItem(alice, household, listId, item.id, { done: true }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('applies the rules: blank text, long text, an unknown kind, too many lists', async () => {
    const { useCases: uc } = sys
    await expect(uc.addListItem(alice, household, listId, { text: '  ' })).rejects.toBeInstanceOf(
      InvariantViolation,
    )
    await expect(
      uc.addListItem(alice, household, listId, { text: 'x'.repeat(201) }),
    ).rejects.toBeInstanceOf(InvariantViolation)
    await expect(
      uc.createList(alice, household, { name: 'x', kind: 'poll' as never }),
    ).rejects.toBeInstanceOf(InvariantViolation)
    for (let n = 1; n < MAX_LISTS_PER_HOUSEHOLD; n++)
      await uc.createList(alice, household, { name: `L${n}`, kind: 'todo' })
    await expect(
      uc.createList(alice, household, { name: 'one too many', kind: 'todo' }),
    ).rejects.toBeInstanceOf(InvariantViolation)
  })

  it('keeps the last write when two people edit the same item', async () => {
    const { useCases: uc } = sys
    const item = (await uc.addListItem(alice, household, listId, { text: 'Milk' })).items[0]!
    await uc.updateListItem(alice, household, listId, item.id, { text: 'Oat milk' })
    const last = await uc.updateListItem(bob, household, listId, item.id, { text: 'Soy milk' })
    expect(last.items[0]).toMatchObject({ text: 'Soy milk', updatedBy: bob.userId })
  })

  it('does not find an item through another list', async () => {
    const { useCases: uc } = sys
    const other = (await uc.createList(alice, household, { name: 'Other', kind: 'todo' })).list.id
    const item = (await uc.addListItem(alice, household, listId, { text: 'Milk' })).items[0]!
    for (const attempt of [
      () => uc.updateListItem(alice, household, other, item.id, { done: true }),
      () => uc.deleteListItem(alice, household, other, item.id),
      () => uc.moveListItem(alice, household, other, item.id, 0),
      () => uc.updateListItem(alice, household, listId, ListItemId('missing'), { done: true }),
    ])
      await expect(attempt()).rejects.toBeInstanceOf(NotFoundError)
  })

  it('publishes open items of a list through a feed, capped and without notes', async () => {
    const { useCases: uc } = sys
    await uc.addListItem(alice, household, listId, {
      text: 'Milk',
      quantity: '2 l',
      note: 'secret',
    })
    const bread = (await uc.addListItem(alice, household, listId, { text: 'Bread' })).items[1]!
    await uc.updateListItem(alice, household, listId, bread.id, { done: true })
    const { token } = await uc.createFeed(alice, household, {
      name: 'Fridge',
      fields: ['list.name', 'list.items'],
      listId,
    })
    const content = await sys.feedReader.read(token)
    expect(content).toEqual({
      list: { name: 'Groceries', items: [{ text: 'Milk', quantity: '2 l' }] },
    })
    expect(JSON.stringify(content)).not.toContain('secret')
  })

  it('shows an empty list instead of failing when the list was deleted', async () => {
    const { useCases: uc } = sys
    const { token } = await uc.createFeed(alice, household, {
      name: 'Fridge',
      fields: ['list.items'],
      listId,
    })
    await uc.deleteList(alice, household, listId)
    expect(await sys.feedReader.read(token)).toEqual({ list: null })
  })

  it('requires a list for the list fields', async () => {
    await expect(
      sys.useCases.createFeed(alice, household, { name: 'Fridge', fields: ['list.items'] }),
    ).rejects.toBeInstanceOf(InvariantViolation)
  })
})
