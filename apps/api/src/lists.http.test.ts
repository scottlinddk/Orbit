import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'

describe.each(['memory', 'sqlite'] as const)('lists over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let bob: TestClient
  let base: string

  beforeEach(async () => {
    env = await createTestEnv({ storage })
    alice = env.client()
    bob = env.client()
    await alice.signUp('alice')
    await bob.signUp('bobby')
    const household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
    await alice.post(`${V1}/households/${household}/members`, { username: 'bobby' })
    base = `${V1}/households/${household}/lists`
  })
  afterEach(() => env.close())

  const create = async (name = 'Groceries') =>
    (await alice.post(base, { name, kind: 'shopping' })).body

  it('creates a list, adds items, and returns the whole list each time', async () => {
    const list = await create()
    expect(list).toMatchObject({ name: 'Groceries', kind: 'shopping', items: [] })

    const added = await bob.post(`${base}/${list.id}/items`, { text: ' Milk ', quantity: '2 l' })
    expect(added.status).toBe(201)
    expect(added.body.items).toHaveLength(1)
    expect(added.body.items[0]).toMatchObject({ text: 'Milk', quantity: '2 l', done: false })

    const read = await alice.get(`${base}/${list.id}`)
    expect(read.body.items.map((i: { text: string }) => i.text)).toEqual(['Milk'])
  })

  it('ticks an item off for everyone, and edits fields independently', async () => {
    const list = await create()
    const [item] = (await alice.post(`${base}/${list.id}/items`, { text: 'Milk', note: 'oat' }))
      .body.items
    const url = `${base}/${list.id}/items/${item.id}`

    const ticked = await bob.patch(url, { done: true })
    expect(ticked.status).toBe(200)
    expect(ticked.body.items[0]).toMatchObject({ done: true, text: 'Milk', note: 'oat' })

    const cleared = await alice.patch(url, { note: null, quantity: '3' })
    expect(cleared.body.items[0].note).toBeUndefined()
    expect(cleared.body.items[0]).toMatchObject({ quantity: '3', done: true })
  })

  it('summarizes open items per list', async () => {
    const list = await create()
    const [a] = (await alice.post(`${base}/${list.id}/items`, { text: 'a' })).body.items
    await alice.post(`${base}/${list.id}/items`, { text: 'b' })
    await alice.patch(`${base}/${list.id}/items/${a.id}`, { done: true })
    const summaries = (await bob.get(base)).body.lists
    expect(summaries).toEqual([
      { id: list.id, name: 'Groceries', kind: 'shopping', openCount: 1, itemCount: 2 },
    ])
  })

  it('moves items, removes one, and clears the completed ones', async () => {
    const list = await create()
    for (const text of ['a', 'b', 'c']) await alice.post(`${base}/${list.id}/items`, { text })
    const items = (await alice.get(`${base}/${list.id}`)).body.items
    const moved = await alice.put(`${base}/${list.id}/items/${items[2].id}/position`, { index: 0 })
    expect(moved.body.items.map((i: { text: string }) => i.text)).toEqual(['c', 'a', 'b'])

    await alice.patch(`${base}/${list.id}/items/${items[0].id}`, { done: true })
    const removed = await alice.delete(`${base}/${list.id}/items/${items[1].id}`)
    expect(removed.body.items.map((i: { text: string }) => i.text)).toEqual(['c', 'a'])

    const cleared = await alice.post(`${base}/${list.id}/clear-completed`)
    expect(cleared.body.items.map((i: { text: string }) => i.text)).toEqual(['c'])
  })

  it('renames and deletes a list', async () => {
    const list = await create()
    const renamed = await bob.put(`${base}/${list.id}/name`, { name: 'Weekend' })
    expect(renamed.body.name).toBe('Weekend')
    expect((await bob.delete(`${base}/${list.id}`)).status).toBe(204)
    expect((await alice.get(`${base}/${list.id}`)).status).toBe(404)
  })

  it('rejects bad input with a problem response', async () => {
    const list = await create()
    const url = `${base}/${list.id}/items`
    expect((await alice.post(url, { text: '' })).status).toBe(400)
    expect((await alice.post(url, { text: 'x'.repeat(201) })).status).toBe(400)
    expect((await alice.post(url, { text: 'ok', extra: true })).status).toBe(400)
    expect((await alice.post(base, { name: 'x', kind: 'poll' })).status).toBe(400)
    const [item] = (await alice.post(url, { text: 'ok' })).body.items
    expect((await alice.patch(`${url}/${item.id}`, {})).status).toBe(400)
    expect((await alice.put(`${url}/${item.id}/position`, { index: -1 })).status).toBe(400)
    // A blank text that passes the schema is still refused by the domain rules.
    const blank = await alice.post(url, { text: '   ' })
    expect(blank.status).toBe(422)
  })

  it('refuses the 51st list and the 501st item with a rule violation', async () => {
    const list = await create('first')
    for (let n = 1; n < 50; n++)
      expect((await alice.post(base, { name: `l${n}`, kind: 'todo' })).status).toBe(201)
    expect((await alice.post(base, { name: 'extra', kind: 'todo' })).status).toBe(422)
    for (let n = 0; n < 500; n++)
      expect((await alice.post(`${base}/${list.id}/items`, { text: `i${n}` })).status).toBe(201)
    expect((await alice.post(`${base}/${list.id}/items`, { text: 'one more' })).status).toBe(422)
  })
})
