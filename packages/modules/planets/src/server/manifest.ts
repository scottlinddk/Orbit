import semver from 'semver'
import { z } from 'zod'

/**
 * Manifest v1 (ADR 0017). Every object is strict: a key that is not in the schema is an
 * error, so a manifest cannot carry code-like fields (`script`, `wasm`, `exec`, `command`...)
 * that a later, more permissive loader might act on.
 */

export const MANIFEST_FILE = 'planet.json'
export const SCHEMA_VERSION = 1

const label = z.string().trim().min(1).max(80)
const sentence = z.string().trim().min(1).max(300)

/** Reverse-DNS, lower case. Becomes the widget type `planet.<id>`, so it can never change. */
export const PLANET_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/
const OPTION_KEY = /^[a-z][a-z0-9_]*$/
const SOURCE_ID = /^[a-z][a-z0-9_]*$/
const SECRET_NAME = /^[a-z][a-z0-9_]*$/
const HOST = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/
const TEMPLATE_PATH = /^templates\/[a-z0-9_-]+\.liquid$/
/** `{config.city}` or `{secret.api_key}` inside a URL or header value. */
export const PLACEHOLDER = /\{(config|secret)\.([a-z][a-z0-9_]*)\}/g

const semverVersion = z.string().refine((v) => semver.valid(v) === v, 'must be a SemVer version')
const semverRange = z
  .string()
  .refine((v) => semver.validRange(v) !== null, 'must be a SemVer range such as ">=0.1.0 <1.0.0"')

const optionBase = {
  key: z.string().regex(OPTION_KEY, 'lower case letters, digits and underscores'),
  label,
  help: sentence.optional(),
}

/** The same shapes as `WidgetOption` in `@orbit/widget-sdk`, so one form model serves both. */
const option = z.discriminatedUnion('kind', [
  z.strictObject({
    ...optionBase,
    kind: z.literal('select'),
    choices: z
      .array(z.strictObject({ value: z.string().min(1).max(80), label }))
      .min(1)
      .max(20),
    default: z.string().max(80),
  }),
  z.strictObject({
    ...optionBase,
    kind: z.literal('number'),
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().positive().optional(),
    default: z.number().finite(),
  }),
  z.strictObject({ ...optionBase, kind: z.literal('toggle'), default: z.boolean() }),
  z.strictObject({
    ...optionBase,
    kind: z.literal('text'),
    maxLength: z.number().int().min(1).max(500),
    default: z.string().max(500),
  }),
])

const host = z.string().regex(HOST, 'a host name such as api.example.com or *.example.com')

const permissions = z.strictObject({
  /** Hosts the Planet may contact, with the methods it needs. Only GET exists today. */
  network: z
    .array(z.strictObject({ host, methods: z.array(z.literal('GET')).min(1).default(['GET']) }))
    .max(20)
    .default([]),
  /** Names of secrets the Planet may use. The administrator sets their values. */
  secrets: z.array(z.string().regex(SECRET_NAME)).max(20).default([]),
  /** Keeps the last good data and webhook payloads. Without it nothing is stored. */
  storage: z.boolean().default(false),
  /** May contact hosts on the local network, if the administrator also allows that host. */
  lan: z.boolean().default(false),
  /** May output markup without escaping (the `raw` filter). */
  raw_output: z.boolean().default(false),
})

const urlTemplate = z.string().min(1).max(2000)
const maxBytes = z.number().int().min(1024).max(1_048_576)

const dataSource = z.discriminatedUnion('type', [
  z.strictObject({
    id: z.string().regex(SOURCE_ID),
    type: z.literal('static'),
    data: z.json(),
  }),
  z.strictObject({
    id: z.string().regex(SOURCE_ID),
    type: z.literal('http_poll'),
    url: urlTemplate,
    headers: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
    parse: z.enum(['json', 'text']).default('json'),
    max_bytes: maxBytes.default(262_144),
  }),
  z.strictObject({
    id: z.string().regex(SOURCE_ID),
    type: z.literal('ical'),
    url: urlTemplate,
    headers: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
    days_ahead: z.number().int().min(1).max(366).default(14),
    max_events: z.number().int().min(1).max(200).default(50),
  }),
  z.strictObject({
    id: z.string().regex(SOURCE_ID),
    type: z.literal('webhook'),
    max_bytes: maxBytes.default(65_536),
    /** Name of a secret. When set, deliveries must carry a matching `x-orbit-signature`. */
    hmac_secret: z.string().regex(SECRET_NAME).optional(),
  }),
])

const refresh = z
  .strictObject({
    interval_seconds: z.number().int().min(60).max(86_400).default(900),
    /** A floor the host enforces, whatever `interval_seconds` says. */
    min_interval_seconds: z.number().int().min(60).max(86_400).default(300),
    jitter_percent: z.number().int().min(0).max(50).default(10),
    backoff_max_seconds: z.number().int().min(60).max(86_400).default(21_600),
  })
  .default({
    interval_seconds: 900,
    min_interval_seconds: 300,
    jitter_percent: 10,
    backoff_max_seconds: 21_600,
  })

export const manifestSchema = z
  .strictObject({
    schema_version: z.literal(SCHEMA_VERSION),
    id: z.string().max(56).regex(PLANET_ID, 'reverse-DNS, lower case, such as com.example.weather'),
    version: semverVersion,
    name: label,
    authors: z.array(label).min(1).max(10),
    license: z.string().min(1).max(60),
    orbit: semverRange,
    permissions: permissions.default({
      network: [],
      secrets: [],
      storage: false,
      lan: false,
      raw_output: false,
    }),
    config_schema: z.array(option).max(20).default([]),
    data_sources: z.array(dataSource).max(10).default([]),
    refresh,
    render: z.strictObject({
      title: label,
      description: sentence,
      default_span: z.number().int().min(1).max(4).default(1),
      template: z.string().regex(TEMPLATE_PATH, 'a path such as templates/main.liquid'),
    }),
  })
  .superRefine((manifest, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })
    const hosts = manifest.permissions.network.map((n) => n.host)
    const secrets = new Set(manifest.permissions.secrets)
    const keys = new Set<string>()
    manifest.config_schema.forEach((o, i) => {
      if (keys.has(o.key)) issue(['config_schema', i, 'key'], `duplicate option key "${o.key}"`)
      keys.add(o.key)
      if (o.kind === 'select' && !o.choices.some((c) => c.value === o.default)) {
        issue(['config_schema', i, 'default'], 'default must be one of the choices')
      }
      if (o.kind === 'number' && (o.min > o.max || o.default < o.min || o.default > o.max)) {
        issue(['config_schema', i, 'default'], 'min, max and default must be consistent')
      }
      if (o.kind === 'text' && o.default.length > o.maxLength) {
        issue(['config_schema', i, 'default'], 'default is longer than maxLength')
      }
    })

    const ids = new Set<string>()
    manifest.data_sources.forEach((source, i) => {
      if (ids.has(source.id)) issue(['data_sources', i, 'id'], `duplicate source id "${source.id}"`)
      ids.add(source.id)
      if (source.type === 'webhook' && !manifest.permissions.storage) {
        issue(['data_sources', i, 'type'], 'a webhook source needs permissions.storage')
      }
      if (source.type === 'webhook' && source.hmac_secret && !secrets.has(source.hmac_secret)) {
        issue(['data_sources', i, 'hmac_secret'], 'secret is not declared in permissions.secrets')
      }
      if (source.type === 'http_poll' || source.type === 'ical') {
        checkUrl(source.url, ['data_sources', i, 'url'], hosts, keys, issue)
        for (const [name, value] of Object.entries(source.headers)) {
          for (const match of value.matchAll(PLACEHOLDER)) {
            const [, kind, key] = match
            if (kind === 'secret' && !secrets.has(key ?? '')) {
              issue(
                ['data_sources', i, 'headers', name],
                `secret "${key}" is not declared in permissions.secrets`,
              )
            }
            if (kind === 'config' && !keys.has(key ?? '')) {
              issue(['data_sources', i, 'headers', name], `unknown option "${key}"`)
            }
          }
        }
      }
    })
    if (manifest.refresh.min_interval_seconds > manifest.refresh.backoff_max_seconds) {
      issue(['refresh', 'min_interval_seconds'], 'must not exceed backoff_max_seconds')
    }
  })

/** The host of a URL template must be written out, so the allowlist can be checked statically. */
function checkUrl(
  template: string,
  path: (string | number)[],
  hosts: string[],
  optionKeys: Set<string>,
  issue: (path: (string | number)[], message: string) => void,
) {
  if (/\{secret\./.test(template)) {
    issue(path, 'secrets belong in headers, not in the URL')
    return
  }
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (!optionKeys.has(match[2] ?? '')) issue(path, `unknown option "${match[2]}"`)
  }
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(template)?.[1]
  if (!authority || authority.includes('{')) {
    issue(path, 'must start with http:// or https:// and a host written out in full')
    return
  }
  if (!/^https?:/i.test(template) && !/^webcals?:/i.test(template)) {
    issue(path, 'must be an http, https or webcal address')
  }
  let hostname: string
  try {
    hostname = new URL(template.replace(PLACEHOLDER, 'x').replace(/^webcals?:/i, 'https:')).hostname
  } catch {
    issue(path, 'is not a valid URL')
    return
  }
  const allowed = hosts.some((h) =>
    h.startsWith('*.') ? hostname.endsWith(h.slice(1)) : hostname === h,
  )
  if (!allowed) issue(path, `host "${hostname}" is not listed in permissions.network`)
}

export type PlanetManifest = z.infer<typeof manifestSchema>
export type PlanetDataSource = PlanetManifest['data_sources'][number]
export type PlanetOptionDefinition = PlanetManifest['config_schema'][number]

export interface ManifestIssue {
  /** Dotted path of the failing field, such as `data_sources.0.url`. Empty for the whole file. */
  readonly path: string
  readonly message: string
}

export class PlanetError extends Error {
  override readonly name = 'PlanetError'
  readonly issues: readonly ManifestIssue[]
  constructor(message: string, issues: readonly ManifestIssue[] = []) {
    super(issues.length > 0 ? `${message}\n${issues.map(formatIssue).join('\n')}` : message)
    this.issues = issues
  }
}

export const formatIssue = (issue: ManifestIssue) =>
  `  ${issue.path || '(manifest)'}: ${issue.message}`

/** Parses a manifest. Errors name the failing field path. */
export function parseManifest(text: string): PlanetManifest {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PlanetError(`${MANIFEST_FILE} is not valid JSON.`)
  }
  const result = manifestSchema.safeParse(json)
  if (result.success) return result.data
  throw new PlanetError(
    `${MANIFEST_FILE} is not a valid Planet manifest:`,
    result.error.issues.flatMap((i) => {
      // An unknown key is reported on the parent; name the key itself.
      if (i.code === 'unrecognized_keys') {
        return i.keys.map((key) => ({
          path: [...i.path, key].join('.'),
          message: 'is not a known field (Planets cannot carry code or extra fields)',
        }))
      }
      return [{ path: i.path.join('.'), message: i.message }]
    }),
  )
}

/** The widget type a Planet registers as. */
export const widgetTypeOf = (planetId: string) => `planet.${planetId}`

/** Whether `type` is a Planet widget, and if so which Planet. */
export const planetIdOfWidgetType = (type: string): string | undefined =>
  type.startsWith('planet.') ? type.slice('planet.'.length) : undefined

/** One line per capability, for the install prompt. Everything the manifest can do is here. */
export function describePermissions(manifest: PlanetManifest): string[] {
  const p = manifest.permissions
  const lines: string[] = []
  for (const n of p.network) lines.push(`Network: contact ${n.host} (${n.methods.join(', ')})`)
  for (const name of p.secrets) lines.push(`Secret: use the stored secret "${name}" in requests`)
  if (p.storage) lines.push('Storage: keep fetched data and webhook payloads')
  if (p.lan) lines.push('LAN: may reach local-network hosts that you also allow by name')
  if (p.raw_output) lines.push('Raw output: may output markup without escaping')
  for (const s of manifest.data_sources) {
    if (s.type === 'webhook')
      lines.push(`Webhook: accepts data posted to a URL for source "${s.id}"`)
  }
  if (lines.length === 0) lines.push('None: this Planet uses only data inside its own files.')
  return lines
}
