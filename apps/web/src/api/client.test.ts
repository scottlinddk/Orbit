import { dashboardSchema } from '@orbit/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client.ts'

const respond = (status: number, body?: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status }),
    ),
  )

afterEach(() => vi.unstubAllGlobals())

const validDashboard = { id: 'd', householdId: 'h', name: 'W', columns: 3, widgets: [] }

describe('request', () => {
  it('returns the response parsed by the schema', async () => {
    respond(200, validDashboard)
    expect(await request('GET', '/dashboards/d', { schema: dashboardSchema })).toEqual(
      validDashboard,
    )
  })

  it('sends JSON with same-origin credentials and nothing extra', async () => {
    respond(200, validDashboard)
    await request('PUT', '/dashboards/d/name', { body: { name: 'X' }, schema: dashboardSchema })
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toBe('/api/v1/dashboards/d/name')
    expect(init).toMatchObject({
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{"name":"X"}',
    })
  })

  it('sends no body or content type for a GET', async () => {
    respond(200, validDashboard)
    await request('GET', '/dashboards/d', { schema: dashboardSchema })
    const init = vi.mocked(fetch).mock.calls[0]![1]!
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })

  it('treats 204 as success without a body', async () => {
    respond(204)
    await expect(request('DELETE', '/dashboards/d')).resolves.toBeUndefined()
  })

  it('turns a problem response into an ApiError with the server message', async () => {
    respond(422, {
      type: 'urn:orbit:problem:rule-violation',
      title: 'Unprocessable',
      status: 422,
      detail: 'Nope',
    })
    const error = await request('POST', '/x', { body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, message: 'Nope' })
  })

  it('joins field errors into the message', async () => {
    respond(400, {
      type: 'urn:orbit:problem:validation',
      title: 'Bad Request',
      status: 400,
      detail: 'The request did not match',
      errors: [
        { path: 'password', message: 'Too short' },
        { path: 'username', message: 'Required' },
      ],
    })
    const error = await request('POST', '/x', { body: {} }).catch((e) => e)
    expect(error.message).toBe('password: Too short. username: Required')
  })

  it('falls back to a generic message when the error body is not a problem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })),
    )
    const error = await request('GET', '/x').catch((e) => e)
    expect(error).toMatchObject({ status: 502, message: 'Request failed (502).' })
  })

  it('reports an unreachable server as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    )
    const error = await request('GET', '/x').catch((e) => e)
    expect(error).toMatchObject({ status: 0 })
    expect(error.message).toMatch(/Cannot reach the server/)
  })

  it('rejects a success response that does not match the schema', async () => {
    respond(200, { id: 'd', name: 42 })
    const error = await request('GET', '/x', { schema: dashboardSchema }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toMatch(/does not understand/)
  })
})
