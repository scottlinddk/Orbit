import { NotFoundError, type Actor } from '@orbit/application'
import { InvariantViolation, UserId, type HouseholdId } from '@orbit/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemorySystem, createSqliteSystem, type TestSystem } from './fixtures.ts'

describe.each([
  ['in-memory', createInMemorySystem],
  ['sqlite', createSqliteSystem],
])('use cases: %s', (_name, create) => {
  let sys: TestSystem
  let alice: Actor
  let household: HouseholdId

  beforeEach(async () => {
    sys = create()
    alice = await sys.newActor('alice')
    household = (await sys.useCases.createHousehold(alice, { name: 'Home' })).id
  })

  it('makes the creator the owner and lists the household for them', async () => {
    const list = await sys.useCases.listHouseholds(alice)
    expect(list).toHaveLength(1)
    expect(list[0]?.members).toEqual([{ userId: alice.userId, role: 'owner' }])
  })

  it('refuses to add a user that does not exist', async () => {
    await expect(
      sys.useCases.addHouseholdMember(alice, household, { userId: UserId('ghost') }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('builds and reorders a dashboard end to end', async () => {
    const { useCases: uc } = sys
    const created = await uc.createDashboard(alice, household, { name: 'Week', columns: 2 })
    await uc.addWidget(alice, created.id, { type: 'calendar.agenda', span: 2 })
    await uc.addWidget(alice, created.id, { type: 'lists.shopping' })
    const withNote = await uc.addWidget(alice, created.id, { type: 'notes.quick', index: 0 })
    expect(withNote.widgets.map((w) => w.type)).toEqual([
      'notes.quick',
      'calendar.agenda',
      'lists.shopping',
    ])

    const moved = await uc.moveWidget(alice, created.id, withNote.widgets[0]!.id, 2)
    expect(moved.widgets.map((w) => w.type)).toEqual([
      'calendar.agenda',
      'lists.shopping',
      'notes.quick',
    ])

    const widened = await uc.resizeWidget(alice, created.id, moved.widgets[0]!.id, 2)
    expect(widened.widgets[0]!.span).toBe(2)
    const configured = await uc.configureWidget(alice, created.id, moved.widgets[0]!.id, {
      days: 5,
    })
    expect(configured.widgets[0]!.config).toEqual({ days: 5 })

    const narrowed = await uc.setDashboardColumns(alice, created.id, 1)
    expect(narrowed.widgets.every((w) => w.span === 1)).toBe(true)

    const removed = await uc.removeWidget(alice, created.id, moved.widgets[1]!.id)
    expect(removed.widgets).toHaveLength(2)
    expect(await uc.getDashboard(alice, created.id)).toEqual(removed)
  })

  it('deletes a dashboard', async () => {
    const d = await sys.useCases.createDashboard(alice, household, { name: 'Temp' })
    await sys.useCases.deleteDashboard(alice, d.id)
    await expect(sys.useCases.getDashboard(alice, d.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('surfaces domain rule violations unchanged', async () => {
    const d = await sys.useCases.createDashboard(alice, household, { name: 'Week' })
    await expect(
      sys.useCases.addWidget(alice, d.id, { type: 'not a widget type' }),
    ).rejects.toBeInstanceOf(InvariantViolation)
    expect((await sys.useCases.getDashboard(alice, d.id)).widgets).toHaveLength(0)
  })
})
