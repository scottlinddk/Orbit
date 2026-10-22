import { SequentialSessionTokens } from '@orbit/adapter-in-memory'
import { FeedTooLargeError, NotFoundError, createFeedReader } from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'
import { describe, expect, it } from 'vitest'
import { createInMemoryRepositories, createSystem } from './fixtures.ts'

describe('feed size cap', () => {
  it('refuses to create a feed that would be too large, and stores nothing', async () => {
    const sys = createSystem(createInMemoryRepositories(), { maxFeedBytes: 20 })
    const alice = await sys.newActor('alice')
    const household = (await sys.useCases.createHousehold(alice, { name: 'A very long household' }))
      .id
    await expect(
      sys.useCases.createFeed(alice, household, { name: 'Big', fields: ['household.name'] }),
    ).rejects.toBeInstanceOf(InvariantViolation)
    expect(await sys.useCases.listFeeds(alice, household)).toEqual([])
  })

  it('stops serving a feed that grew past the cap instead of cutting it short', async () => {
    const repos = createInMemoryRepositories()
    const sys = createSystem(repos)
    const alice = await sys.newActor('alice')
    const household = (await sys.useCases.createHousehold(alice, { name: 'A' })).id
    const { token } = await sys.useCases.createFeed(alice, household, {
      name: 'Hall',
      fields: ['household.name'],
    })
    const strict = createFeedReader({
      ...repos,
      tokens: new SequentialSessionTokens(),
      maxFeedBytes: 5,
    })
    await expect(strict.read(token)).rejects.toBeInstanceOf(FeedTooLargeError)
    // A wrong token is still just not found, never "too large".
    await expect(strict.read('nope')).rejects.toBeInstanceOf(NotFoundError)
  })
})
