import { useId, useState, type FormEvent } from 'react'
import type { ConnectionResponse } from '@orbit/contracts'
import {
  useAddConnection,
  useConnectionEntities,
  useConnections,
  useRemoveConnection,
  useSetMirrors,
  useTestConnection,
} from '../../api/connections.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

type Kind = ConnectionResponse['kind']

/** What each system is called, what its credential is called, and an example address. */
const KINDS: Record<Kind, { label: string; credential: string; example: string; howTo: string }> = {
  homeassistant: {
    label: 'Home Assistant',
    credential: 'Access token',
    example: 'http://homeassistant.local:8123',
    howTo: 'Create a long-lived access token on your Home Assistant profile page.',
  },
  mealie: {
    label: 'Mealie',
    credential: 'API token',
    example: 'http://mealie.local:9000',
    howTo: 'Create an API token in your Mealie user profile. Mealie 2 or newer is needed.',
  },
  grocy: {
    label: 'Grocy',
    credential: 'API key',
    example: 'http://grocy.local:9283',
    howTo: 'Create an API key in Grocy under "Manage API keys". Grocy 4 or newer is needed.',
  },
}

/** Ticks what to show from the other system. Asking for it calls out to that system. */
function MirrorPicker({
  householdId,
  connection,
  onDone,
}: {
  householdId: string
  connection: ConnectionResponse
  onDone: () => void
}) {
  const entities = useConnectionEntities(householdId, connection.id, true)
  const save = useSetMirrors(householdId)
  // Until the owner touches a box, the saved choice is what is ticked.
  const [picked, setPicked] = useState<Set<string> | undefined>(undefined)
  const chosen =
    picked ?? new Set(entities.data?.filter((e) => e.mirrored).map((e) => e.entityId) ?? [])

  function toggle(entityId: string, on: boolean) {
    const next = new Set(chosen)
    if (on) next.add(entityId)
    else next.delete(entityId)
    setPicked(next)
  }

  if (entities.isPending) return <Loading />
  if (entities.isError) return <Alert>{entities.error.message}</Alert>

  const group = (role: 'calendar' | 'todo' | 'meals' | 'stock', legend: string) => {
    const rows = entities.data.filter((e) => e.role === role)
    return (
      <fieldset>
        <legend>{legend}</legend>
        {rows.length === 0 ? <p>None found.</p> : null}
        {rows.map((e) => (
          <label key={e.entityId} style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={chosen.has(e.entityId)}
              onChange={(event) => toggle(e.entityId, event.target.checked)}
            />{' '}
            {e.name}
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate({ connectionId: connection.id, entityIds: [...chosen] }, { onSuccess: onDone })
      }}
    >
      {save.error ? <Alert>{save.error.message}</Alert> : null}
      {group('calendar', 'Calendars to show')}
      {group('todo', 'Lists to show (read only)')}
      {group('meals', 'Meal plan to show (read only)')}
      {group('stock', 'Stock to show (read only)')}
      <Button type="submit" variant="primary" busy={save.isPending}>
        Save
      </Button>
    </form>
  )
}

/**
 * Owners connect Home Assistant, Mealie or Grocy here. The address and the credential are typed
 * once and kept encrypted: nothing on this page can show them again. What the owner ticks appears
 * in the household's calendar, lists, meal plan and stock for everyone, read only.
 */
export function ConnectionsPanel({ householdId }: { householdId: string }) {
  const [kind, setKind] = useState<Kind>('homeassistant')
  const [name, setName] = useState('Home Assistant')
  const kindId = useId()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [choosing, setChoosing] = useState<string | undefined>(undefined)
  const connections = useConnections(householdId)
  const add = useAddConnection(householdId)
  const remove = useRemoveConnection(householdId)
  const test = useTestConnection(householdId)

  function submit(event: FormEvent) {
    event.preventDefault()
    add.mutate(
      { kind, name, url, token },
      {
        onSuccess: (created) => {
          // Neither secret lingers on screen, and the next step is choosing what to show.
          setUrl('')
          setToken('')
          setChoosing(created.id)
        },
      },
    )
  }

  const error = add.error ?? remove.error ?? (connections.isError ? connections.error : null)

  return (
    <section className={styles.panel} aria-labelledby="connections-heading">
      <h2 id="connections-heading">Connections</h2>
      <p>
        Show calendars and lists from Home Assistant, the meal plan from Mealie, or shopping lists
        and stock from Grocy. Orbit only reads them, and keeps the address and the credential
        encrypted. {KINDS[kind].howTo} Paste it here and nowhere else.
      </p>
      {error ? <Alert>{error.message}</Alert> : null}
      {connections.isPending ? <Loading /> : null}
      {connections.data?.length === 0 ? <p>No connections yet.</p> : null}
      <ul className={styles.members}>
        {connections.data?.map((connection) => (
          <li key={connection.id} className={styles.member}>
            {connection.name} · {connection.host} · {connection.mirrors.length} shown{' '}
            <Button
              busy={test.isPending && test.variables === connection.id}
              onClick={() => test.mutate(connection.id)}
              aria-label={`Test connection ${connection.name}`}
            >
              Test
            </Button>{' '}
            <Button
              onClick={() => setChoosing(choosing === connection.id ? undefined : connection.id)}
              aria-label={`Choose what to show from ${connection.name}`}
              aria-expanded={choosing === connection.id}
            >
              Choose
            </Button>{' '}
            <Button
              variant="danger"
              busy={remove.isPending && remove.variables === connection.id}
              onClick={() => remove.mutate(connection.id)}
              aria-label={`Remove connection ${connection.name}`}
            >
              Remove
            </Button>
            {test.data && test.variables === connection.id ? (
              <p role="status">
                {test.data.ok
                  ? `It works: ${test.data.calendars} calendars, ${test.data.todoLists} lists, ${test.data.mealPlans} meal plans and ${test.data.stockViews} stock views found.`
                  : `It does not work: ${test.data.error ?? 'no answer'}`}
              </p>
            ) : null}
            {choosing === connection.id ? (
              <MirrorPicker
                householdId={householdId}
                connection={connection}
                onDone={() => setChoosing(undefined)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className={styles.form}>
        <label htmlFor={kindId}>System</label>
        <select
          id={kindId}
          value={kind}
          onChange={(event) => {
            const next = event.target.value as Kind
            // Keep a name the owner typed. Replace only the name that came with the old choice.
            if (name === KINDS[kind].label) setName(KINDS[next].label)
            setKind(next)
          }}
        >
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KINDS[k].label}
            </option>
          ))}
        </select>
        <TextField
          label="Connection name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <TextField
          label={`${KINDS[kind].label} address`}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={2000}
          required
          autoComplete="off"
          spellCheck={false}
          hint={`For example ${KINDS[kind].example}. On a home network the server operator must allow this host.`}
        />
        <TextField
          label={KINDS[kind].credential}
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          maxLength={4000}
          required
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" busy={add.isPending}>
          Add connection
        </Button>
      </form>
    </section>
  )
}
