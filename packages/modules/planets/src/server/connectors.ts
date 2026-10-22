import {
  EgressDeniedError,
  type EgressFetcher,
  type PlanetJson,
  type SecretStore,
} from '@orbit/application'
import { PLACEHOLDER, type PlanetDataSource, type PlanetManifest } from './manifest.ts'
import { redactJson, redactSecrets } from './redact.ts'

const REQUEST_TIMEOUT_MS = 10_000
const DAY_MS = 24 * 60 * 60 * 1000

/** A source failed. The message is safe to show: no secret values, no internal addresses. */
export class SourceError extends Error {
  override readonly name = 'SourceError'
}

/**
 * Reads calendar events from an ICS feed. The composition root supplies it, built on the ICS
 * integration and the shared egress guard, so Planets do not carry a second parser.
 */
export type IcalReader = (request: {
  url: string
  from: Date
  to: Date
  maxEvents: number
  headers: Readonly<Record<string, string>>
  allowedHosts: readonly string[]
  allowPrivate: boolean
}) => Promise<PlanetJson[]>

export interface ConnectorDeps {
  readonly fetcher: EgressFetcher
  readonly readIcal: IcalReader
  readonly secrets: SecretStore
}

export interface SourceContext {
  readonly manifest: PlanetManifest
  /** Resolved option values of the placement. */
  readonly config: Readonly<Record<string, string | number | boolean>>
  readonly now: Date
}

export const secretScope = (planetId: string) => `planet:${planetId}`

type Pollable = Extract<PlanetDataSource, { type: 'http_poll' | 'ical' }>

export const isPollable = (source: PlanetDataSource): source is Pollable =>
  source.type === 'http_poll' || source.type === 'ical'

/** The `static` and `webhook` sources do not fetch. Only `http_poll` and `ical` do. */
export async function fetchSource(
  source: Pollable,
  context: SourceContext,
  deps: ConnectorDeps,
): Promise<PlanetJson> {
  const { manifest } = context
  const scope = secretScope(manifest.id)
  // Every declared secret that has a value is known here, so anything one of them echoes in a
  // response can be removed. Values are used for headers and redaction only.
  const secretValues = new Map<string, string>()
  for (const name of manifest.permissions.secrets) {
    const value = await deps.secrets.get(scope, name)
    if (value !== undefined) secretValues.set(name, value)
  }
  const redactList = [...secretValues.values()]

  const url = source.url.replace(PLACEHOLDER, (_m, kind: string, key: string) => {
    if (kind !== 'config') return ''
    return encodeURIComponent(String(context.config[key] ?? ''))
  })
  const headers: Record<string, string> = {}
  for (const [name, template] of Object.entries(source.headers)) {
    headers[name] = template.replace(PLACEHOLDER, (_m, kind: string, key: string) => {
      if (kind === 'secret') {
        const value = secretValues.get(key)
        if (value === undefined) {
          throw new SourceError(
            `The secret "${key}" has no value. Set it with: orbit planet secret set ${manifest.id} ${key}`,
          )
        }
        return value
      }
      return String(context.config[key] ?? '')
    })
  }
  const allowedHosts = manifest.permissions.network.map((n) => n.host)
  const allowPrivate = manifest.permissions.lan

  try {
    if (source.type === 'ical') {
      const events = await deps.readIcal({
        url,
        from: context.now,
        to: new Date(context.now.getTime() + source.days_ahead * DAY_MS),
        maxEvents: source.max_events,
        headers,
        allowedHosts,
        allowPrivate,
      })
      return redactJson(events.slice(0, source.max_events), redactList) as PlanetJson
    }
    const response = await deps.fetcher.fetchText({
      url,
      maxBytes: source.max_bytes,
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers,
      allowedHosts,
      allowPrivate,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new SourceError(`The server answered with status ${response.status}.`)
    }
    // Some APIs echo the key they were called with. Remove it before the body is parsed, stored
    // or handed to a template.
    const body = redactSecrets(response.body, redactList)
    if (source.parse === 'text') return body
    try {
      return JSON.parse(body) as PlanetJson
    } catch {
      throw new SourceError('The server did not return valid JSON.')
    }
  } catch (error) {
    if (error instanceof SourceError) throw error
    if (error instanceof EgressDeniedError) throw new SourceError(error.message)
    // Anything else (a parser bug, a library error) may carry text from the response.
    throw new SourceError(redactSecrets(`Source "${source.id}" failed.`, redactList))
  }
}
