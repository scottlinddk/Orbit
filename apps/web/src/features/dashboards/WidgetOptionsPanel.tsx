import type { WidgetResponse } from '@orbit/contracts'
import type { WidgetDefinition } from '@orbit/widget-sdk'
import { useId } from 'react'
import { Button } from '../../components/Button.tsx'
import { CloseIcon } from '../../components/icons.tsx'
import { OptionFields } from './OptionFields.tsx'
import styles from './Sidebar.module.css'

interface Props {
  placement: WidgetResponse
  definition: WidgetDefinition | undefined
  columns: number
  index: number
  count: number
  busy: boolean
  onResize: (span: number) => void
  onMove: (toIndex: number) => void
  onConfig: (config: Record<string, unknown>) => void
  onRemove: () => void
  onClose: () => void
}

/** Everything that can be changed about the selected widget: width, place, and its own settings. */
export function WidgetOptionsPanel(props: Props) {
  const { placement, definition, columns, index, count, busy } = props
  const title = definition?.title ?? placement.type
  const headingId = useId()
  const group = useId()

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.panelHeader}>
        <h2 id={headingId}>{title} options</h2>
        <Button aria-label="Close options" onClick={props.onClose}>
          <CloseIcon />
        </Button>
      </div>

      <fieldset className={styles.fieldset} disabled={busy}>
        <legend className={styles.legend}>Width in columns</legend>
        <div className={styles.segments}>
          {Array.from({ length: columns }, (_, i) => i + 1).map((n) => (
            <label key={n} className={styles.segment}>
              <input
                type="radio"
                name={group}
                value={n}
                checked={placement.span === n}
                onChange={() => props.onResize(n)}
              />
              <span>{n}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.row}>
        <Button
          disabled={busy || index === 0}
          onClick={() => props.onMove(index - 1)}
          aria-label={`Move ${title} earlier`}
        >
          ↑ Earlier
        </Button>
        <Button
          disabled={busy || index === count - 1}
          onClick={() => props.onMove(index + 1)}
          aria-label={`Move ${title} later`}
        >
          ↓ Later
        </Button>
      </div>

      {definition?.options?.length ? (
        <OptionFields
          options={definition.options}
          config={placement.config}
          disabled={busy}
          onChange={props.onConfig}
        />
      ) : (
        <p className={styles.hint}>This widget has no settings.</p>
      )}

      <div className={styles.start}>
        <Button variant="danger" disabled={busy} onClick={props.onRemove}>
          Remove from dashboard
        </Button>
      </div>
    </section>
  )
}
