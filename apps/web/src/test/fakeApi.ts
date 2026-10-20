import { vi, afterEach, expect } from 'vitest'

export interface RecordedCall {
  method: string
  path: string
  body: unknown
}

type Reply = { status?: number; body?: unknown }
type Handler = Reply | ((call: RecordedCall) => Reply)

/**
 * Replaces fetch with canned answers keyed "METHOD /api/v1/path". The UI is exercised through
 * its real network code. Any request without a handler fails the test, so a UI that starts
 * calling an endpoint nobody stubbed cannot pass silently.
 */
export function stubApi(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = []
  const unhandled: string[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'
      const call: RecordedCall = {
        method,
        path: url.pathname,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      calls.push(call)
      const handler = handlers[`${method} ${url.pathname}`]
      if (!handler) {
        unhandled.push(`${method} ${url.pathname}`)
        return new Response('{}', { status: 500 })
      }
      const reply = typeof handler === 'function' ? handler(call) : handler
      const status = reply.status ?? 200
      if (status === 204) return new Response(null, { status })
      return new Response(JSON.stringify(reply.body ?? {}), {
        status,
        headers: {
          'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
        },
      })
    }),
  )

  afterEach(() => {
    vi.unstubAllGlobals()
    const missed = unhandled.splice(0)
    expect(missed, 'requests without a stubbed answer').toEqual([])
  })

  return {
    calls,
    /** Requests of one kind, for asserting what the UI sent. */
    sent: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  }
}

export const problem = (status: number, detail: string, type = 'rule-violation') => ({
  status,
  body: { type: `urn:orbit:problem:${type}`, title: 'Problem', status, detail },
})
