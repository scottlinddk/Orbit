import { useState, type FormEvent } from 'react'
import type { DeliveryResponse, NotificationEventName } from '@orbit/contracts'
import {
  useAddNotificationEndpoint,
  useDeliveries,
  useNotificationEndpoints,
  useRemoveNotificationEndpoint,
  useSendTestNotification,
  useUpdateNotificationEndpoint,
} from '../../api/notifications.ts'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { Loading } from '../../components/Loading.tsx'
import { TextField } from '../../components/TextField.tsx'
import styles from './Household.module.css'

const EVENTS: { value: NotificationEventName; label: string }[] = [
  { value: 'calendar.event.starting', label: 'A calendar event is about to start' },
  { value: 'list.item.added', label: 'Someone adds an item to a list' },
  { value: 'list.item.completed', label: 'Someone ticks an item off a list' },
]
const eventLabel = (event: string) =>
  EVENTS.find((e) => e.value === event)?.label ?? (event === 'notification.test' ? 'Test' : event)

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })

/**
 * Owners send household news to a webhook they run: Home Assistant, ntfy, n8n or a chat bridge.
 * Orbit keeps the address encrypted and shows only its host. The signing secret is shown once,
 * when the webhook is added, because a receiver needs it to check where a message came from.
 */
export function NotificationsPanel({ householdId }: { householdId: string }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<NotificationEventName[]>(['list.item.added'])
  const [leadMinutes, setLeadMinutes] = useState('15')
  const [openLog, setOpenLog] = useState<string | undefined>()
  const [testResult, setTestResult] = useState<{ id: string; entry: DeliveryResponse }>()
  const [copied, setCopied] = useState(false)
  const endpoints = useNotificationEndpoints(householdId)
  const add = useAddNotificationEndpoint(householdId)
  const update = useUpdateNotificationEndpoint(householdId)
  const remove = useRemoveNotificationEndpoint(householdId)
  const test = useSendTestNotification(householdId)
  const wantsReminder = events.includes('calendar.event.starting')
  // Held here and only here. A page reload loses it on purpose: the server cannot show it again.
  const fresh = add.data

  function toggle(event: NotificationEventName) {
    setEvents((current) =>
      current.includes(event) ? current.filter((e) => e !== event) : [...current, event],
    )
  }

  function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault()
    setCopied(false)
    add.mutate(
      {
        name,
        url,
        events,
        ...(wantsReminder ? { leadMinutes: Number(leadMinutes) } : {}),
      },
      {
        onSuccess: () => {
          setName('')
          setUrl('')
        },
      },
    )
  }

  async function copy(secret: string) {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      // Clipboard access can be refused. The secret stays selectable in the field.
      setCopied(false)
    }
  }

  const error =
    add.error ??
    update.error ??
    remove.error ??
    test.error ??
    (endpoints.isError ? endpoints.error : null)

  return (
    <section className={styles.panel} aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Notifications</h2>
      <p>
        Send reminders and list news to a webhook you run, such as Home Assistant, ntfy or n8n.
        Every message is signed, and the signing key is shown once when you add the webhook. Orbit
        keeps the address encrypted, so paste it here and nowhere else. A server on your home
        network needs the administrator to allow its host first.
      </p>
      {error ? <Alert>{error.message}</Alert> : null}
      {endpoints.isPending ? <Loading /> : null}
      {endpoints.data?.length === 0 ? <p>No webhooks yet.</p> : null}
      <ul className={styles.members}>
        {endpoints.data?.map((endpoint) => (
          <li key={endpoint.id} className={styles.member}>
            <div>
              <strong>{endpoint.name}</strong> · {endpoint.host}
              <div>
                {endpoint.events.map(eventLabel).join(', ')}
                {endpoint.events.includes('calendar.event.starting')
                  ? `, ${endpoint.leadMinutes} minutes before`
                  : ''}
              </div>
              {endpoint.enabled ? (
                endpoint.failures > 0 ? (
                  <div>
                    {endpoint.failures} failed {endpoint.failures === 1 ? 'delivery' : 'deliveries'}{' '}
                    in a row
                  </div>
                ) : null
              ) : (
                <div role="status">Switched off. {endpoint.disabledReason}</div>
              )}
            </div>
            <div>
              <Button
                busy={test.isPending && test.variables === endpoint.id}
                onClick={() =>
                  test.mutate(endpoint.id, {
                    onSuccess: (entry) => setTestResult({ id: endpoint.id, entry }),
                  })
                }
                aria-label={`Send a test to ${endpoint.name}`}
              >
                Send test
              </Button>{' '}
              <Button
                busy={update.isPending && update.variables?.id === endpoint.id}
                onClick={() => update.mutate({ id: endpoint.id, enabled: !endpoint.enabled })}
                aria-label={`${endpoint.enabled ? 'Switch off' : 'Switch on'} ${endpoint.name}`}
              >
                {endpoint.enabled ? 'Switch off' : 'Switch on'}
              </Button>{' '}
              <Button
                aria-expanded={openLog === endpoint.id}
                onClick={() => setOpenLog(openLog === endpoint.id ? undefined : endpoint.id)}
                aria-label={`${openLog === endpoint.id ? 'Hide' : 'Show'} the log of ${endpoint.name}`}
              >
                {openLog === endpoint.id ? 'Hide log' : 'Log'}
              </Button>{' '}
              <Button
                variant="danger"
                busy={remove.isPending && remove.variables === endpoint.id}
                onClick={() => remove.mutate(endpoint.id)}
                aria-label={`Remove ${endpoint.name}`}
              >
                Remove
              </Button>
            </div>
            {testResult?.id === endpoint.id ? (
              <p role="status">
                {testResult.entry.outcome === 'delivered'
                  ? `Test delivered (status ${testResult.entry.httpStatus}).`
                  : `Test failed. ${testResult.entry.error ?? ''}`}
              </p>
            ) : null}
            {openLog === endpoint.id ? (
              <DeliveryLog householdId={householdId} endpointId={endpoint.id} />
            ) : null}
          </li>
        ))}
      </ul>
      {fresh ? (
        <div className={styles.form}>
          <TextField
            label={`Signing secret for ${fresh.name}`}
            value={fresh.signingSecret}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
            hint="Shown only now. Receivers use it to check the X-Orbit-Signature header. Keep it private."
          />
          <Button onClick={() => void copy(fresh.signingSecret)}>
            {copied ? 'Copied' : 'Copy secret'}
          </Button>
          <Button onClick={() => add.reset()}>I have saved it</Button>
        </div>
      ) : null}
      <h3 className={styles.subheading}>Add a webhook</h3>
      <form onSubmit={submit} className={styles.form}>
        <TextField
          label="Webhook name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <TextField
          label="Webhook address"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          maxLength={2000}
          required
          autoComplete="off"
          spellCheck={false}
          hint="Starts with https:// or http://."
        />
        <fieldset>
          <legend>Send when</legend>
          {EVENTS.map((event) => (
            <label key={event.value} style={{ display: 'block' }}>
              <input
                type="checkbox"
                checked={events.includes(event.value)}
                onChange={() => toggle(event.value)}
              />{' '}
              {event.label}
            </label>
          ))}
        </fieldset>
        {wantsReminder ? (
          <TextField
            label="Minutes before an event"
            type="number"
            min={1}
            max={1440}
            value={leadMinutes}
            onChange={(event) => setLeadMinutes(event.target.value)}
            required
          />
        ) : null}
        <Button type="submit" variant="primary" busy={add.isPending} disabled={events.length === 0}>
          Add webhook
        </Button>
      </form>
    </section>
  )
}

function DeliveryLog({ householdId, endpointId }: { householdId: string; endpointId: string }) {
  const deliveries = useDeliveries(householdId, endpointId, true)
  if (deliveries.isPending) return <Loading />
  if (deliveries.isError) return <Alert>{deliveries.error.message}</Alert>
  if (deliveries.data.length === 0) return <p>Nothing has been sent yet.</p>
  return (
    <ul aria-label="Recent deliveries">
      {deliveries.data.map((d, index) => (
        <li key={`${d.deliveryId}-${d.attempt}-${index}`}>
          {time(d.at)} · {eventLabel(d.event)} · {d.outcome}
          {d.httpStatus === undefined ? '' : ` (${d.httpStatus})`}
          {d.attempt > 1 ? `, try ${d.attempt}` : ''}
          {d.error ? ` · ${d.error}` : ''}
        </li>
      ))}
    </ul>
  )
}
