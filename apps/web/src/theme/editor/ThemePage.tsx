import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Alert } from '../../components/Alert.tsx'
import { Button } from '../../components/Button.tsx'
import { PageHeader } from '../../components/PageHeader.tsx'
import { PRESETS, sameTheme } from '../presets.ts'
import { BORDER_WIDTH_MAX, RADIUS_MAX, type ColorKey, type Theme } from '../schema.ts'
import { serializeTheme } from '../storage.ts'
import { useTheme } from '../ThemeContext.ts'
import { ColorField } from './ColorField.tsx'
import { NameField } from './NameField.tsx'
import { FontField } from './FontField.tsx'
import { RangeField } from './RangeField.tsx'
import { Segmented } from './Segmented.tsx'
import { ThemePreview } from './ThemePreview.tsx'
import { readability } from './readability.ts'
import styles from './ThemePage.module.css'

const COLOR_GROUPS: readonly {
  heading: string
  fields: readonly { key: ColorKey; label: string }[]
}[] = [
  {
    heading: 'Page and cards',
    fields: [
      { key: 'background', label: 'Page background' },
      { key: 'surface', label: 'Card' },
      { key: 'surfaceRaised', label: 'Inner surface' },
      { key: 'border', label: 'Border' },
    ],
  },
  {
    heading: 'Text and buttons',
    fields: [
      { key: 'text', label: 'Text' },
      { key: 'textMuted', label: 'Secondary text' },
      { key: 'accent', label: 'Button and active tab' },
      { key: 'accentText', label: 'Button text' },
    ],
  },
  {
    heading: 'Highlight cards',
    fields: [
      { key: 'heroFrom', label: 'Highlight top' },
      { key: 'heroVia', label: 'Highlight middle' },
      { key: 'heroTo', label: 'Highlight bottom' },
      { key: 'heroText', label: 'Highlight text' },
    ],
  },
  {
    heading: 'Status',
    fields: [
      { key: 'danger', label: 'Negative' },
      { key: 'success', label: 'Positive' },
      { key: 'warning', label: 'In progress' },
    ],
  },
]

export function ThemePage() {
  const { theme, customized, setTheme, reset, importTheme } = useTheme()
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const importId = useId()

  /** Any edit turns a preset into the person's own theme, so the preset itself stays as shipped. */
  const edit = (change: (current: Theme) => Theme) => {
    const next = change(theme)
    // Choosing what is already chosen is not an edit, and must not turn a preset into a custom theme.
    if (sameTheme(next, theme)) return
    const wasPreset = PRESETS.some((p) => p.theme.name === theme.name)
    setTheme(wasPreset && next.name === theme.name ? { ...next, name: 'My theme' } : next)
  }

  const checks = readability(theme)
  const failing = checks.filter((c) => !c.pass)

  function download() {
    const url = URL.createObjectURL(new Blob([serializeTheme(theme)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'orbit-theme.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) setImportText(await file.text())
  }

  function applyImport() {
    const ok = importTheme(importText)
    setImportError(!ok)
    if (ok) setImportText('')
  }

  return (
    <>
      <PageHeader
        eyebrow="Choose fonts, colors and shapes. Changes apply at once and stay in this browser."
        title="Appearance"
        actions={
          <Button onClick={reset} disabled={!customized}>
            Reset to default
          </Button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section className={styles.panel} aria-labelledby="presets-heading">
            <h2 id="presets-heading">Presets</h2>
            <ul className={styles.presets}>
              {PRESETS.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className={styles.preset}
                    aria-pressed={sameTheme(theme, preset.theme)}
                    onClick={() => setTheme(preset.theme)}
                  >
                    <span
                      className={styles.presetSwatch}
                      aria-hidden="true"
                      style={{
                        background: `linear-gradient(135deg, ${preset.theme.colors.heroFrom}, ${preset.theme.colors.heroVia} 55%, ${preset.theme.colors.heroTo})`,
                        borderColor: preset.theme.colors.accent,
                      }}
                    />
                    {preset.theme.name}
                  </button>
                </li>
              ))}
            </ul>
            <NameField value={theme.name} onChange={(name) => setTheme({ ...theme, name })} />
          </section>

          <section className={styles.panel} aria-labelledby="fonts-heading">
            <h2 id="fonts-heading">Fonts</h2>
            <p className={styles.note}>
              Google Fonts, served from this server. Nothing is requested from Google.
            </p>
            <div className={styles.grid}>
              <FontField
                label="Headings"
                value={theme.fonts.heading}
                onChange={(heading) => edit((t) => ({ ...t, fonts: { ...t.fonts, heading } }))}
              />
              <FontField
                label="Body text"
                value={theme.fonts.body}
                onChange={(body) => edit((t) => ({ ...t, fonts: { ...t.fonts, body } }))}
              />
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="colors-heading">
            <h2 id="colors-heading">Colors</h2>
            <Segmented
              legend="Color scheme"
              value={theme.scheme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(scheme) => edit((t) => ({ ...t, scheme }))}
            />
            <p className={styles.note}>
              The scheme tells the browser how to draw scrollbars and form controls. Set the colors
              below to match.
            </p>
            {COLOR_GROUPS.map((group) => (
              <fieldset key={group.heading} className={styles.fieldset}>
                <legend className={styles.legend}>{group.heading}</legend>
                <div className={styles.grid}>
                  {group.fields.map(({ key, label }) => (
                    <ColorField
                      key={key}
                      label={label}
                      value={theme.colors[key]}
                      onChange={(hex) =>
                        edit((t) => ({ ...t, colors: { ...t.colors, [key]: hex } }))
                      }
                    />
                  ))}
                </div>
              </fieldset>
            ))}
            <Segmented
              legend="Highlight card style"
              value={theme.heroStyle}
              options={[
                { value: 'gradient', label: 'Gradient' },
                { value: 'solid', label: 'Solid' },
              ]}
              onChange={(heroStyle) => edit((t) => ({ ...t, heroStyle }))}
            />
          </section>

          <section className={styles.panel} aria-labelledby="shape-heading">
            <h2 id="shape-heading">Shape and spacing</h2>
            <div className={styles.grid}>
              <RangeField
                label="Corner radius"
                value={theme.shape.radius}
                min={0}
                max={RADIUS_MAX}
                unit="px"
                onChange={(radius) => edit((t) => ({ ...t, shape: { ...t.shape, radius } }))}
              />
              <RangeField
                label="Border width"
                value={theme.shape.borderWidth}
                min={0}
                max={BORDER_WIDTH_MAX}
                unit="px"
                onChange={(borderWidth) =>
                  edit((t) => ({ ...t, shape: { ...t.shape, borderWidth } }))
                }
              />
            </div>
            <Segmented
              legend="Border style"
              value={theme.shape.borderStyle}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dashed', label: 'Dashed' },
                { value: 'dotted', label: 'Dotted' },
                { value: 'double', label: 'Double' },
              ]}
              onChange={(borderStyle) =>
                edit((t) => ({ ...t, shape: { ...t.shape, borderStyle } }))
              }
            />
            <Segmented
              legend="Button shape"
              value={theme.shape.buttons}
              options={[
                { value: 'pill', label: 'Pill' },
                { value: 'rounded', label: 'Rounded' },
                { value: 'square', label: 'Square' },
              ]}
              onChange={(buttons) => edit((t) => ({ ...t, shape: { ...t.shape, buttons } }))}
            />
            <Segmented
              legend="Card shadow"
              value={theme.shape.shadow}
              options={[
                { value: 'none', label: 'None' },
                { value: 'soft', label: 'Soft' },
                { value: 'strong', label: 'Strong' },
              ]}
              onChange={(shadow) => edit((t) => ({ ...t, shape: { ...t.shape, shadow } }))}
            />
            <Segmented
              legend="Spacing"
              value={theme.density}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'spacious', label: 'Spacious' },
              ]}
              onChange={(density) => edit((t) => ({ ...t, density }))}
            />
          </section>

          <section className={styles.panel} aria-labelledby="backup-heading">
            <h2 id="backup-heading">Backup and sharing</h2>
            <p className={styles.note}>
              Export the theme to keep it or use it in another browser. Themes are stored in this
              browser only.
            </p>
            <div className={styles.actions}>
              <Button onClick={download}>Download theme</Button>
              <Button onClick={() => fileInput.current?.click()}>Import from file</Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                tabIndex={-1}
                aria-label="Theme file"
                onChange={(event) => void onFile(event)}
              />
            </div>
            <label htmlFor={importId} className={styles.label}>
              Or paste theme JSON
            </label>
            <textarea
              id={importId}
              className={styles.textarea}
              rows={5}
              value={importText}
              spellCheck={false}
              onChange={(event) => {
                setImportText(event.target.value)
                setImportError(false)
              }}
            />
            {importError ? <Alert>That is not a valid Orbit theme.</Alert> : null}
            <div className={styles.actions}>
              <Button onClick={applyImport} disabled={importText.trim() === ''}>
                Apply pasted theme
              </Button>
            </div>
          </section>
        </div>

        <aside className={styles.side} aria-label="Preview and readability">
          <section className={styles.panel} aria-labelledby="preview-heading">
            <h2 id="preview-heading">Preview</h2>
            <ThemePreview />
          </section>
          <section className={styles.panel} aria-labelledby="readability-heading">
            <h2 id="readability-heading">Readability</h2>
            {failing.length > 0 ? (
              <p role="status" className={styles.warn}>
                {failing.length} {failing.length === 1 ? 'pair is' : 'pairs are'} hard to read.
              </p>
            ) : (
              <p role="status" className={styles.note}>
                Every pair reaches its WCAG contrast target.
              </p>
            )}
            <ul className={styles.checks}>
              {checks.map((c) => (
                <li key={c.label} className={c.pass ? styles.pass : styles.fail}>
                  <span>{c.label}</span>
                  <span>
                    {c.ratio.toFixed(1)}:1 {c.pass ? 'OK' : `needs ${c.needs}:1`}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.note}>
              Body text needs 4.5:1. Large text and the bottom of a gradient need 3:1.
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}
