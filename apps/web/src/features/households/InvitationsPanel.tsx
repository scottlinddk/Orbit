import { useState, type FormEvent } from 'react'
import type { CreatedInvitationResponse } from '@orbit/contracts'
import { useCreateInvitation, useInvitations, useRevokeInvitation } from '../../api/invitations.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

const ROLES = [
  { value: 'member', label: 'Member (can view)' },
  { value: 'owner', label: 'Owner (can manage)' },
] as const

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })

/**
 * The token is in the fragment, not the path or query: browsers never send a fragment to the
 * server, so the secret stays out of access logs and proxies.
 */
export const inviteLink = (token: string) => `${window.location.origin}/join#${token}`

export function InvitationsPanel({ householdId }: { householdId: string }) {
  const [role, setRole] = useState<'member' | 'owner'>('member')
  const [copied, setCopied] = useState(false)
  const invitations = useInvitations(householdId, true)
  const create = useCreateInvitation(householdId)
  const revoke = useRevokeInvitation(householdId)
  // Held here and only here. A page reload loses it on purpose: the server cannot show it again.
  const fresh: CreatedInvitationResponse | undefined = create.data

  function submit(event: FormEvent) {
    event.preventDefault()
    setCopied(false)
    create.mutate({ role })
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // Clipboard access can be refused. The link stays selectable in the field.
      setCopied(false)
    }
  }

  const error = create.error ?? revoke.error ?? (invitations.isError ? invitations.error : null)

  return (
    <section className={styles.panel} aria-labelledby="invitations-heading">
      <h2 id="invitations-heading">Invite someone</h2>
      <p>
        They get a link and choose their own username and password. No account is needed first, and
        you do not need access to the server.
      </p>
      {error ? <Alert>{error.message}</Alert> : null}
      <form onSubmit={submit} className={styles.form}>
        <SelectField
          label="Role"
          value={role}
          options={ROLES}
          onChange={(event) => setRole(event.target.value === 'owner' ? 'owner' : 'member')}
        />
        <Button type="submit" variant="primary" busy={create.isPending}>
          Create invitation link
        </Button>
      </form>
      {fresh ? (
        <div className={styles.form}>
          <TextField
            label="Invitation link"
            value={inviteLink(fresh.token)}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            hint={`Shown only now. It works once and expires on ${date(fresh.expiresAt)}. Send it privately.`}
          />
          <Button onClick={() => void copy(inviteLink(fresh.token))}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      ) : null}
      <h3 className={styles.subheading}>Open invitations</h3>
      {invitations.isPending ? <Loading /> : null}
      {invitations.data?.length === 0 ? <p>No open invitations.</p> : null}
      <ul className={styles.members}>
        {invitations.data?.map((invitation, index) => (
          <li key={invitation.id} className={styles.member}>
            {invitation.role === 'owner' ? 'Owner' : 'Member'} invitation, expires{' '}
            {date(invitation.expiresAt)}{' '}
            <Button
              variant="danger"
              busy={revoke.isPending && revoke.variables === invitation.id}
              onClick={() => revoke.mutate(invitation.id)}
              aria-label={`Revoke invitation ${index + 1}`}
            >
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
