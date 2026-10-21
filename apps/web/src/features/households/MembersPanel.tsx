import { useState, type FormEvent } from 'react'
import type { HouseholdResponse } from '@orbit/contracts'
import { useAddMember, useRemoveMember } from '../../api/households.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

interface Props {
  household: HouseholdResponse
  meId: string
  isOwner: boolean
}

export function MembersPanel({ household, meId, isOwner }: Props) {
  const [username, setUsername] = useState('')
  const add = useAddMember(household.id)
  const remove = useRemoveMember(household.id)

  function submit(event: FormEvent) {
    event.preventDefault()
    add.mutate({ username }, { onSuccess: () => setUsername('') })
  }

  const error = add.error ?? remove.error

  return (
    <section className={styles.panel} aria-labelledby="members-heading">
      <h2 id="members-heading">Members</h2>
      {error ? <Alert>{error.message}</Alert> : null}
      <ul className={styles.members}>
        {household.members.map((m, index) => (
          <li key={m.userId} className={styles.member}>
            {m.userId === meId ? 'You' : `Member ${index + 1}`} · {m.role}
            {isOwner && m.userId !== meId ? (
              <>
                {' '}
                <Button
                  variant="danger"
                  busy={remove.isPending && remove.variables === m.userId}
                  onClick={() => remove.mutate(m.userId)}
                  aria-label={`Remove member ${index + 1}`}
                >
                  Remove
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={submit} className={styles.form}>
          <TextField
            label="Add a member by username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            autoCapitalize="none"
            spellCheck={false}
            hint="For someone who already has an account here. Otherwise send an invitation."
          />
          <Button type="submit" busy={add.isPending}>
            Add member
          </Button>
        </form>
      ) : null}
    </section>
  )
}
