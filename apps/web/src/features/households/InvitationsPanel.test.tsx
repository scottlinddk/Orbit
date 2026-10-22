// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ME, dashboard, household } from '../../test/fixtures.ts'
import { problem, stubApi } from '../../test/fakeApi.ts'
import { renderApp } from '../../test/render.tsx'

const EXPIRES = '2026-02-01T00:00:00.000Z'
const open = (id: string, role = 'member') => ({
  id,
  role,
  createdAt: '2026-01-25T00:00:00.000Z',
  expiresAt: EXPIRES,
})

const api = (invitations: unknown[] = []) => ({
  'GET /api/v1/auth/me': { body: ME },
  'GET /api/v1/households': { body: { households: [household()] } },
  'GET /api/v1/households/h1': { body: household() },
  'GET /api/v1/households/h1/dashboards': { body: { dashboards: [dashboard()] } },
  'GET /api/v1/households/h1/invitations': { body: { invitations } },
})

describe('invitations panel', () => {
  it('says so when nothing is open', async () => {
    stubApi(api())
    renderApp('/h/h1')
    const panel = await screen.findByRole('region', { name: 'Invite someone' })
    expect(await within(panel).findByText('No open invitations.')).toBeInTheDocument()
  })

  it('creates a link with the chosen role and shows the secret in the fragment', async () => {
    let listed: unknown[] = []
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/invitations': () => ({ body: { invitations: listed } }),
      'POST /api/v1/households/h1/invitations': () => {
        listed = [open('i1', 'device')]
        return { status: 201, body: { ...open('i1', 'device'), token: 'secret-token_123' } }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.selectOptions(await screen.findByLabelText('Role'), 'device')
    await user.click(screen.getByRole('button', { name: 'Create invitation link' }))

    const link = (await screen.findByLabelText('Invitation link')) as HTMLInputElement
    expect(link.value).toBe(`${window.location.origin}/join#secret-token_123`)
    expect(link.value).not.toContain('?')
    expect(link).toHaveAttribute('readonly')
    expect(stub.sent('POST', '/api/v1/households/h1/invitations')[0]?.body).toEqual({
      role: 'device',
    })
    // The open list shows the invitation, but never the secret.
    const panel = screen.getByRole('region', { name: 'Invite someone' })
    expect(await within(panel).findByText(/Device invitation, expires/)).toBeInTheDocument()
    expect(within(panel).queryAllByText(/secret-token_123/)).toHaveLength(0)
  })

  it('copies the link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubApi({
      ...api(),
      'POST /api/v1/households/h1/invitations': {
        status: 201,
        body: { ...open('i1'), token: 'abc' },
      },
    })
    const { user } = renderApp('/h/h1')
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(await screen.findByRole('button', { name: 'Create invitation link' }))
    await user.click(await screen.findByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join#abc`)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('revokes an open invitation', async () => {
    let listed = [open('i1'), open('i2', 'owner')]
    const stub = stubApi({
      ...api(),
      'GET /api/v1/households/h1/invitations': () => ({ body: { invitations: listed } }),
      'DELETE /api/v1/households/h1/invitations/i1': () => {
        listed = listed.filter((i) => i.id !== 'i1')
        return { status: 204 }
      },
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Revoke invitation 1' }))
    expect(await screen.findByText(/^Owner invitation/)).toBeInTheDocument()
    expect(screen.queryByText(/^Member invitation/)).not.toBeInTheDocument()
    expect(stub.sent('DELETE', '/api/v1/households/h1/invitations/i1')).toHaveLength(1)
  })

  it('shows why creating a link failed', async () => {
    stubApi({
      ...api(),
      'POST /api/v1/households/h1/invitations': problem(403, 'Not allowed', 'forbidden'),
    })
    const { user } = renderApp('/h/h1')
    await user.click(await screen.findByRole('button', { name: 'Create invitation link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed')
    expect(screen.queryByLabelText('Invitation link')).not.toBeInTheDocument()
  })
})
