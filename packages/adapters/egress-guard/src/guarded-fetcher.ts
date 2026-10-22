import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import {
  EgressDeniedError,
  type EgressFetcher,
  type EgressRequest,
  type EgressResponse,
} from '@orbit/application'
import { isBlockedAddress } from './address.ts'

const MAX_REDIRECTS = 3

export interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

/** Headers a caller may not set: they would break the guard's own rules or the HTTP framing. */
const FORBIDDEN_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'host',
  'proxy-authorization',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
])
const HEADER_NAME = /^[a-z0-9!#$%&'*+.^_`|~-]+$/i

function checkHeaders(headers: Readonly<Record<string, string>> | undefined) {
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(name.toLowerCase())) {
      throw new EgressDeniedError('header', 'That request header is not allowed.')
    }
    if (/[\r\n\0]/.test(value)) {
      throw new EgressDeniedError('header', 'That request header is not valid.')
    }
  }
}

/** Whether `host` is covered by an allowlist entry: exact, or `*.domain` for subdomains. */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const name = host.replace(/^\[|\]$/g, '').toLowerCase()
  return allowed.some((entry) => {
    const pattern = entry.toLowerCase()
    return pattern.startsWith('*.') ? name.endsWith(pattern.slice(1)) : name === pattern
  })
}

export interface GuardedFetcherOptions {
  /**
   * Hostnames (lower case, no port) an administrator allows to resolve to private addresses,
   * for a CalDAV server or calendar on the LAN. Opting in is per host, never global.
   */
  readonly allowPrivateHosts?: ReadonlySet<string>
  /** Replaceable so tests can script DNS answers. Must return every address of the name. */
  readonly resolve?: (hostname: string) => Promise<ResolvedAddress[]>
}

async function defaultResolve(hostname: string): Promise<ResolvedAddress[]> {
  const found = await dnsLookup(hostname, { all: true, verbatim: true })
  return found.flatMap((entry) =>
    entry.family === 4 || entry.family === 6
      ? [{ address: entry.address, family: entry.family } as ResolvedAddress]
      : [],
  )
}

/**
 * An `EgressFetcher` that resolves DNS once, refuses private destinations, connects to the
 * address it checked, and follows redirects itself so every hop is checked again.
 */
export function createGuardedFetcher(options: GuardedFetcherOptions = {}): EgressFetcher {
  const allowPrivate = options.allowPrivateHosts ?? new Set<string>()
  const resolve = options.resolve ?? defaultResolve

  async function pick(url: URL, privateAllowed: boolean): Promise<ResolvedAddress> {
    // URL keeps the brackets of an IPv6 literal in `hostname`.
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    let addresses: ResolvedAddress[]
    if (isIP(host)) {
      addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }]
    } else {
      try {
        addresses = await resolve(host)
      } catch {
        throw new EgressDeniedError('dns', 'The host name could not be resolved.')
      }
    }
    const first = addresses[0]
    if (!first) throw new EgressDeniedError('dns', 'The host name could not be resolved.')
    // Every answer must be public. One private record in a mixed answer is how rebinding attacks
    // hide, so it is not enough that the first one passes.
    if (
      !(privateAllowed && allowPrivate.has(host)) &&
      addresses.some((a) => isBlockedAddress(a.address))
    ) {
      throw new EgressDeniedError('blocked-address', 'That address is not allowed.')
    }
    return first
  }

  return {
    async fetchText(request: EgressRequest): Promise<EgressResponse> {
      checkHeaders(request.headers)
      let current = parseUrl(request.url)
      const origin = current.origin
      const deadline = Date.now() + request.timeoutMs
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (request.allowedHosts && !hostAllowed(current.hostname, request.allowedHosts)) {
          throw new EgressDeniedError('host-not-allowed', 'That host is not on the allowed list.')
        }
        const target = await pick(current, request.allowPrivate !== false)
        // Credentials the caller supplied belong to the host it named, not to wherever a
        // redirect leads.
        const headers = current.origin === origin ? request.headers : undefined
        const result = await get(current, target, request, headers, deadline - Date.now())
        if (result.redirect === undefined) return result.response
        let next: URL
        try {
          next = parseUrl(new URL(result.redirect, current).toString())
        } catch (error) {
          if (error instanceof EgressDeniedError) {
            throw new EgressDeniedError('redirect', 'The feed redirected somewhere not allowed.')
          }
          throw new EgressDeniedError('redirect', 'The feed sent an invalid redirect.')
        }
        // A secure feed must not drop to plain http by way of a redirect.
        if (current.protocol === 'https:' && next.protocol === 'http:') {
          throw new EgressDeniedError('redirect', 'The feed redirected to an insecure address.')
        }
        current = next
      }
      throw new EgressDeniedError('redirect', 'The feed redirected too many times.')
    },
  }
}

function parseUrl(text: string): URL {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new EgressDeniedError('invalid-url', 'That is not a valid address.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EgressDeniedError('scheme', 'Only http and https addresses are allowed.')
  }
  if (url.username !== '' || url.password !== '') {
    throw new EgressDeniedError('credentials', 'Put credentials in the secret field, not the URL.')
  }
  return url
}

interface HopResult {
  readonly response: EgressResponse
  readonly redirect?: string | undefined
}

function get(
  url: URL,
  target: ResolvedAddress,
  request: EgressRequest,
  headers: Readonly<Record<string, string>> | undefined,
  timeLeftMs: number,
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    if (timeLeftMs <= 0) {
      reject(new EgressDeniedError('timeout', 'The request took too long.'))
      return
    }
    const transport = url.protocol === 'https:' ? https : http
    const req = transport.request(
      url,
      {
        method: 'GET',
        // Connect to the address that was checked. The URL still supplies the Host header and the
        // TLS server name, so certificates are verified against the real host name.
        lookup: (_host, _opts, callback) => {
          // Node calls this with `all` set on recent versions and without it on older ones.
          ;(callback as (e: null, a: string | unknown[], f?: number) => void)(
            null,
            _opts && (_opts as { all?: boolean }).all
              ? [{ address: target.address, family: target.family }]
              : target.address,
            target.family,
          )
        },
        headers: { 'user-agent': 'Orbit', accept: '*/*', ...headers },
        agent: false,
        timeout: timeLeftMs,
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (status >= 300 && status < 400 && location) {
          res.resume()
          resolve({ redirect: location, response: emptyResponse(status, url) })
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > request.maxBytes) {
            req.destroy(new EgressDeniedError('too-large', 'The response is too large.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const contentType = res.headers['content-type']
          resolve({
            response: {
              status,
              body: Buffer.concat(chunks).toString('utf8'),
              finalUrl: url.toString(),
              ...(contentType ? { contentType } : {}),
            },
          })
        })
        res.on('error', (error) => reject(toDenied(error)))
      },
    )
    req.on('timeout', () =>
      req.destroy(new EgressDeniedError('timeout', 'The request took too long.')),
    )
    req.on('error', (error) => reject(toDenied(error)))
    req.end()
  })
}

function emptyResponse(status: number, url: URL): EgressResponse {
  return { status, body: '', finalUrl: url.toString() }
}

function toDenied(error: unknown): EgressDeniedError {
  return error instanceof EgressDeniedError
    ? error
    : new EgressDeniedError('network', 'The server could not be reached.')
}
