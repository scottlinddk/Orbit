import { defineWidget, type WidgetOption, type WidgetProps } from '@orbit/widget-sdk'
import { useContext, useId, useState, type FormEvent } from 'react'
import { ListsHostContext, type ListsHost } from './host.ts'
import styles from './ShoppingWidget.module.css'

function AddForm({
  label,
  button,
  disabled,
  onSubmit,
}: {
  label: string
  button: string
  disabled?: boolean
  onSubmit: (text: string) => void
}) {
  const [text, setText] = useState('')
  const id = useId()
  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (trimmed === '') return
    onSubmit(trimmed)
    setText('')
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        value={text}
        maxLength={200}
        placeholder={label}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className={styles.button} disabled={disabled || text.trim() === ''}>
        {button}
      </button>
    </form>
  )
}

function Body({ host, listId }: { host: ListsHost; listId: string | undefined }) {
  const all = host.useLists()
  // A saved list that was deleted falls back to the first one rather than showing nothing.
  const chosen = all.lists.find((l) => l.id === listId) ?? all.lists[0]
  const list = host.useList(chosen?.id)
  const creating = host.useCreateList()

  if (all.status === 'unavailable') return <p>Lists are not available here.</p>
  if (all.status === 'pending') return <p>Loading lists…</p>
  if (all.status === 'error') return <p role="alert">The lists could not be loaded.</p>

  if (!chosen) {
    if (host.readOnly) return <p className={styles.muted}>No lists yet.</p>
    return (
      <div>
        <p className={styles.muted}>No lists yet. Name your first one.</p>
        <AddForm
          label="Name of the new list"
          button="Create list"
          disabled={creating.busy}
          onSubmit={(name) => creating.create(name)}
        />
        {creating.error ? <p role="alert">{creating.error}</p> : null}
      </div>
    )
  }

  if (list.status === 'pending') return <p>Loading {chosen.name}…</p>
  if (list.status === 'error') return <p role="alert">This list could not be loaded.</p>

  const open = list.items.filter((i) => !i.done)
  const done = list.items.filter((i) => i.done)
  return (
    <div className={styles.root}>
      <p className={styles.heading}>
        {list.name} <span className={styles.muted}>· {open.length} to get</span>
      </p>
      {list.items.length === 0 ? <p className={styles.muted}>Nothing on this list yet.</p> : null}
      <ul className={styles.items} aria-label={list.name}>
        {[...open, ...done].map((item) => (
          <li key={item.id} className={item.done ? styles.done : undefined}>
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={host.readOnly || list.readOnly}
                onChange={(event) => list.setDone(item.id, event.target.checked)}
              />
              <span>
                {item.text}
                {item.quantity ? <span className={styles.muted}> · {item.quantity}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {host.readOnly ? null : list.readOnly ? (
        <p className={styles.muted}>This list is kept in another system. Change it there.</p>
      ) : (
        <AddForm label="Add an item" button="Add" onSubmit={list.add} />
      )}
      {list.syncError ? <p role="status">Not up to date: {list.syncError}</p> : null}
      {done.length > 0 && !host.readOnly && !list.readOnly ? (
        <button type="button" className={styles.link} onClick={list.clearCompleted}>
          Clear {done.length} completed
        </button>
      ) : null}
      {list.error ? <p role="alert">{list.error}</p> : null}
    </div>
  )
}

function Shopping({ config }: WidgetProps) {
  const host = useContext(ListsHostContext)
  const listId = typeof config.listId === 'string' ? config.listId : undefined
  return <Body host={host} listId={listId} />
}

/** Which list the widget shows. The choices come from the household's lists. */
function useShoppingOptions(): readonly WidgetOption[] {
  const { lists } = useContext(ListsHostContext).useLists()
  return [
    {
      kind: 'select',
      key: 'listId',
      label: 'List',
      help: 'The list this widget shows. A deleted list falls back to the first one.',
      default: '',
      choices: [
        { value: '', label: 'First list' },
        ...lists.map((l) => ({ value: l.id, label: l.name })),
      ],
    },
  ]
}

export const shoppingWidget = defineWidget({
  type: 'lists.shopping',
  title: 'Shopping list',
  description: 'A list the whole household can add to and tick off.',
  defaultSpan: 1,
  status: 'stable',
  useOptions: useShoppingOptions,
  Component: Shopping,
})
