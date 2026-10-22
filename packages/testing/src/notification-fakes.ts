import {
  EgressDeniedError,
  type EgressFetcher,
  type EgressRequest,
  type EgressResponse,
  type NotificationPlatform,
} from '@orbit/application'
import { InvariantViolation } from '@orbit/domain'

/**
 * The platform parts of notifications without node:crypto. The "signature" is readable, so a
 * test can see what it covers. The real HMAC is tested against a fixed vector in apps/api.
 */
export class FakeNotificationPlatform implements NotificationPlatform {
  #secrets = 0

  newSecret() {
    this.#secrets += 1
    return `secret-${this.#secrets}`
  }

  sign(secret: string, timestamp: number, body: string) {
    return `${secret}:${timestamp}:${body.length}`
  }

  parseAddress(input: string) {
    const url = input.trim()
    const host = /^https?:\/\/([^/\s?#:@]+)/i.exec(url)?.[1]
    if (host === undefined || /^https?:\/\/[^/]*@/i.test(url))
      throw new InvariantViolation('That is not a valid web address')
    return { url, host }
  }

  byteLength(text: string) {
    return Buffer.byteLength(text, 'utf8')
  }
}

export type WebhookReply = number | Error | ((request: EgressRequest) => number | Error)

/**
 * A webhook receiver for tests. Replies are queued per address (the last one repeats); an
 * address with no reply answers 200. `calls` records every request, so tests can read headers,
 * body and count.
 */
export class FakeWebhookFetcher implements EgressFetcher {
  readonly calls: EgressRequest[] = []
  readonly #replies = new Map<string, WebhookReply[]>()

  reply(url: string, ...replies: WebhookReply[]) {
    this.#replies.set(url, replies)
  }

  callsTo(url: string) {
    return this.calls.filter((c) => c.url === url)
  }

  async fetchText(request: EgressRequest): Promise<EgressResponse> {
    this.calls.push(request)
    const queue = this.#replies.get(request.url)
    const next = queue && queue.length > 1 ? queue.shift()! : queue?.[0]
    const outcome = typeof next === 'function' ? next(request) : (next ?? 200)
    if (outcome instanceof Error) throw outcome
    return { status: outcome, body: '', finalUrl: request.url }
  }
}

export const timeout = () => new EgressDeniedError('timeout', 'The request took too long.')
export const blocked = () =>
  new EgressDeniedError('blocked-address', 'That address is not allowed.')
