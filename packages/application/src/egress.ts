/**
 * Outbound HTTP for anything that fetches a URL a user typed in: ICS feeds, CalDAV servers and
 * later Planets. Those URLs are untrusted, so a server on the household's network must not be
 * reachable through them by accident (SSRF). Integrations take this port instead of calling
 * `fetch`, and one adapter enforces the rules in one place (ADR 0003).
 */
export interface EgressRequest {
  readonly url: string
  /** The body is cut off with an `EgressDeniedError` once it grows past this many bytes. */
  readonly maxBytes: number
  readonly timeoutMs: number
  readonly headers?: Readonly<Record<string, string>>
  /**
   * When set, the request and every redirect hop must go to one of these hosts. `example.com`
   * matches that host only, `*.example.com` matches its subdomains. Planets pass the hosts their
   * manifest declares, so a redirect cannot lead somewhere the administrator never saw.
   */
  readonly allowedHosts?: readonly string[]
  /**
   * `false` refuses private destinations even for hosts the administrator opted in. Planets
   * pass the `lan` permission of their manifest, so a Planet that never declared it cannot reach
   * the LAN just because another integration may. Defaults to true (the administrator's list).
   */
  readonly allowPrivate?: boolean
  /** Defaults to GET. A POST is never redirected: a redirect would resend the body elsewhere. */
  readonly method?: 'GET' | 'POST'
  /** The request body, for POST. The caller sets its `content-type` header. */
  readonly body?: string
}

export interface EgressResponse {
  readonly status: number
  readonly body: string
  readonly contentType?: string
  /** The URL that answered, after redirects. */
  readonly finalUrl: string
}

export interface EgressFetcher {
  /**
   * GET, or POST with a text body (the OpenID Connect token request). Cookies are never sent or
   * stored, and caller headers are not forwarded to a different origin after a redirect.
   */
  fetchText(request: EgressRequest): Promise<EgressResponse>
}

export type EgressDeniedReason =
  | 'invalid-url'
  | 'scheme'
  | 'credentials'
  | 'host-not-allowed'
  | 'header'
  | 'blocked-address'
  | 'dns'
  | 'redirect'
  | 'too-large'
  | 'timeout'
  | 'network'

/**
 * The request was refused or failed. The message is safe to show the user. It never says which
 * internal address a name resolved to, so a feed URL cannot be used to map the network.
 */
export class EgressDeniedError extends Error {
  readonly reason: EgressDeniedReason
  constructor(reason: EgressDeniedReason, message: string) {
    super(message)
    this.name = 'EgressDeniedError'
    this.reason = reason
  }
}
