import { useState, type FormEvent } from 'react'
import {
  useAddCalendarSource,
  useCalendarSources,
  useRemoveCalendarSource,
} from '../../api/calendar.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

const DEFAULT_COLOR = '#3b82f6'

/**
 * Owners connect calendars here by pasting the "secret address in iCal format" that Nextcloud,
 * Fastmail, iCloud and Google show for a calendar. Orbit stores the address encrypted and never
 * shows it again, so the form is the only place it is ever typed.
 */
export function CalendarPanel({ householdId }: { householdId: string }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const sources = useCalendarSources(householdId)
  const add = useAddCalendarSource(householdId)
  const remove = useRemoveCalendarSource(householdId)

  function submit(event: FormEvent) {
    event.preventDefault()
    add.mutate(
      { name, url, color },
      {
        onSuccess: () => {
          setName('')
          setUrl('')
        },
      },
    )
  }

  const error = add.error ?? remove.error ?? (sources.isError ? sources.error : null)

  return (
    <section className={styles.panel} aria-labelledby="calendars-heading">
      <h2 id="calendars-heading">Calendars</h2>
      <p>
        Show events from a calendar you can share as an ICS link. Orbit only reads it, and keeps the
        link encrypted. Anyone with the link can read that calendar, so paste it here and nowhere
        else.
      </p>
      {error ? <Alert>{error.message}</Alert> : null}
      {sources.isPending ? <Loading /> : null}
      {sources.data?.length === 0 ? <p>No calendars connected yet.</p> : null}
      <ul className={styles.members}>
        {sources.data?.map((source) => (
          <li key={source.id} className={styles.member}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '0.7rem',
                height: '0.7rem',
                borderRadius: '50%',
                marginRight: '0.5rem',
                background: source.color ?? 'currentColor',
              }}
            />
            {source.name} · {source.host}{' '}
            <Button
              variant="danger"
              busy={remove.isPending && remove.variables === source.id}
              onClick={() => remove.mutate(source.id)}
              aria-label={`Remove calendar ${source.name}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className={styles.form}>
        <TextField
          label="Calendar name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <TextField
          label="ICS address"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={2000}
          required
          autoComplete="off"
          spellCheck={false}
          hint="Starts with https:// or webcal://."
        />
        <TextField
          label="Color"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <Button type="submit" variant="primary" busy={add.isPending}>
          Add calendar
        </Button>
      </form>
    </section>
  )
}
