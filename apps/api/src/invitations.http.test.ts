import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PASSWORD, createTestEnv, type TestClient, type TestEnv } from './test-support.ts'

const V1 = '/api/v1'
const DAY = 24 * 60 * 60 * 1000

describe.each(['memory', 'sqlite'] as const)('household invitations over HTTP (%s)', (storage) => {
  let env: TestEnv
  let alice: TestClient
  let anon: TestClient
  let household: string

  beforeEach(async () => {
    // Registration is closed after the first account, as on a real instance.
    env = await createTestEnv({ storage, env: { ORBIT_REGISTRATION: 'first-user-only' } })
    alice = env.client()
    anon = env.client()
    await alice.signUp('alice')
    household = (await alice.post(`${V1}/households`, { name: 'Home' })).body.id
  })
  afterEach(() => env.close())

  const invite = async (body: object = {}) => {
    const res = await alice.post(`${V1}/households/${household}/invitations`, body)
    expect(res.status).toBe(201)
    return res.body as { id: string; token: string; role: string; expiresAt: string }
  }
  const accept = (token: string, username = 'bobby', password = PASSWORD) =>
    anon.post(`${V1}/invitations/accept`, { token, username, password })

  it('takes a new person from link to signed-in member without operator access', async () => {
    const { token } = await invite()

    const preview = await anon.post(`${V1}/invitations/preview`, { token })
    expect(preview.status).toBe(200)
    expect(preview.body).toEqual({ householdName: 'Home', role: 'member' })

    const joined = await accept(token)
    expect(joined.status).toBe(201)
    expect(joined.raw.cookies).toEqual([])

    const bob = env.client()
    expect(
      (await bob.post(`${V1}/auth/login`, { username: 'bobby', password: PASSWORD })).status,
    ).toBe(200)
    const households = (await bob.get(`${V1}/households`)).body.households
    expect(households.map((h: { id: string }) => h.id)).toEqual([household])
    expect(
      households[0].members.find((m: { userId: string }) => m.userId === joined.body.id).role,
    ).toBe('member')
    // Plain registration stays closed for everyone else.
    expect(
      (await anon.post(`${V1}/auth/register`, { username: 'carol', password: PASSWORD })).status,
    ).toBe(403)
  })

  it('shows the secret once, on creation, and never again', async () => {
    const created = await invite()
    expect(created.token).toBeTruthy()
    const listed = await alice.get(`${V1}/households/${household}/invitations`)
    expect(listed.status).toBe(200)
    expect(listed.body.invitations).toHaveLength(1)
    expect(JSON.stringify(listed.body)).not.toContain(created.token)
    expect(Object.keys(listed.body.invitations[0]).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'role',
    ])
  })

  it('uses a different secret for every invitation', async () => {
    const a = await invite()
    const b = await invite()
    expect(a.token).not.toBe(b.token)
  })

  it('defaults to seven days and lets the owner choose the role and lifetime', async () => {
    const week = await invite()
    const day = await invite({ role: 'device', expiresInDays: 1 })
    const created = Date.parse(week.expiresAt) - 7 * DAY
    expect(Date.parse(day.expiresAt)).toBe(created + DAY)
    expect(day.role).toBe('device')
    expect(
      (await alice.post(`${V1}/households/${household}/invitations`, { expiresInDays: 0 })).status,
    ).toBe(400)
    expect(
      (await alice.post(`${V1}/households/${household}/invitations`, { expiresInDays: 31 })).status,
    ).toBe(400)
    expect(
      (await alice.post(`${V1}/households/${household}/invitations`, { role: 'admin' })).status,
    ).toBe(400)
    // Nobody becomes an owner through a link.
    expect(
      (await alice.post(`${V1}/households/${household}/invitations`, { role: 'owner' })).status,
    ).toBe(400)
  })

  it('stops a link from working after it is revoked', async () => {
    const { id, token } = await invite()
    expect((await alice.delete(`${V1}/households/${household}/invitations/${id}`)).status).toBe(204)
    expect((await anon.post(`${V1}/invitations/preview`, { token })).status).toBe(404)
    expect((await accept(token)).status).toBe(404)
    expect((await alice.get(`${V1}/households/${household}/invitations`)).body.invitations).toEqual(
      [],
    )
  })

  it('refuses to revoke an invitation that was already used', async () => {
    const { id, token } = await invite()
    await accept(token)
    const res = await alice.delete(`${V1}/households/${household}/invitations/${id}`)
    expect(res.status).toBe(422)
  })

  it('works once, and an expired, used, revoked or made-up link all answer the same', async () => {
    const used = await invite()
    await accept(used.token)
    const revoked = await invite()
    await alice.delete(`${V1}/households/${household}/invitations/${revoked.id}`)
    const expired = await invite({ expiresInDays: 1 })
    env.clock.advance(DAY)

    const answers = await Promise.all(
      [used.token, revoked.token, expired.token, 'made-up'].map((token) =>
        anon.post(`${V1}/invitations/preview`, { token }),
      ),
    )
    for (const res of answers) {
      expect(res.status).toBe(404)
      expect(res.body).toEqual(answers[0]!.body)
    }
    expect((await accept(expired.token, 'carol')).status).toBe(404)
  })

  it('keeps the link usable after a taken username', async () => {
    const { token } = await invite()
    expect((await accept(token, 'alice')).status).toBe(409)
    expect((await accept(token, 'bobby')).status).toBe(201)
  })

  it('rejects weak passwords and malformed bodies without using the link up', async () => {
    const { token } = await invite()
    expect((await accept(token, 'bobby', 'short')).status).toBe(400)
    expect((await accept(token, 'bobby')).status).toBe(201)
    const second = await invite()
    expect(
      (
        await anon.post(`${V1}/invitations/accept`, {
          token: second.token,
          username: 'carol',
          password: PASSWORD,
          role: 'owner',
        })
      ).status,
    ).toBe(400)
    expect((await anon.post(`${V1}/invitations/preview`, {})).status).toBe(400)
    expect((await accept(second.token, 'carol')).status).toBe(201)
  })

  it("cannot revoke another household's invitation through your own household", async () => {
    const { id, token } = await invite()
    const carol = env.client()
    // Registration is closed, so carol joins through an invitation and then makes her own household.
    const second = await invite()
    await accept(second.token, 'carol')
    await carol.post(`${V1}/auth/login`, { username: 'carol', password: PASSWORD })
    const carolsHousehold = (await carol.post(`${V1}/households`, { name: 'Hers' })).body.id

    const res = await carol.delete(`${V1}/households/${carolsHousehold}/invitations/${id}`)
    const missing = await carol.delete(
      `${V1}/households/${carolsHousehold}/invitations/does-not-exist`,
    )
    expect(res.status).toBe(404)
    expect(res.body).toEqual(missing.body)
    expect((await anon.post(`${V1}/invitations/preview`, { token })).status).toBe(200)
  })

  it('does not let a member invite anyone, even into the household they belong to', async () => {
    const { token } = await invite()
    await accept(token)
    const bob = env.client()
    await bob.post(`${V1}/auth/login`, { username: 'bobby', password: PASSWORD })
    expect((await bob.post(`${V1}/households/${household}/invitations`, {})).status).toBe(403)
    expect((await bob.get(`${V1}/households/${household}/invitations`)).status).toBe(403)
  })

  it('refuses a cross-site request to accept', async () => {
    const { token } = await invite()
    const res = await anon.post(
      `${V1}/invitations/accept`,
      { token, username: 'bobby', password: PASSWORD },
      { origin: 'https://evil.example' },
    )
    expect(res.status).toBe(403)
    expect((await anon.post(`${V1}/invitations/preview`, { token })).status).toBe(200)
  })
})

describe('invitation rate limiting', () => {
  it('limits guesses at the public endpoints like it limits login attempts', async () => {
    const env = await createTestEnv({ app: { authRateLimit: { max: 3, timeWindow: '1 minute' } } })
    try {
      const anon = env.client()
      const statuses: number[] = []
      for (let i = 0; i < 5; i++)
        statuses.push(
          (await anon.post(`${V1}/invitations/preview`, { token: `guess-${i}` })).status,
        )
      expect(statuses).toEqual([404, 404, 404, 429, 429])
    } finally {
      await env.close()
    }
  })
})
