import { createHmac, randomBytes } from 'node:crypto'
import type { NotificationPlatform } from '@orbit/application'
import { InvariantViolation, MAX_WEBHOOK_URL_LENGTH, invariant } from '@orbit/domain'

/**
 * The parts of notifications that need Node: random secrets, HMAC-SHA256 and URL parsing.
 *
 * A receiver verifies a delivery by computing the HMAC of `<X-Orbit-Timestamp>.<raw body>` with
 * its signing secret and comparing it, in constant time, with the hex after `sha256=` in
 * `X-Orbit-Signature`. It should also refuse timestamps more than a few minutes old.
 */
export function createNodeNotificationPlatform(): NotificationPlatform {
  return {
    newSecret: () => randomBytes(32).toString('hex'),
    sign: (secret, timestamp, body) =>
      createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'),
    parseAddress(input) {
      const text = input.trim()
      invariant(
        text.length > 0 && text.length <= MAX_WEBHOOK_URL_LENGTH,
        `The address must be 1 to ${MAX_WEBHOOK_URL_LENGTH} characters`,
      )
      let url: URL
      try {
        url = new URL(text)
      } catch {
        throw new InvariantViolation('That does not look like a web address')
      }
      invariant(
        url.protocol === 'https:' || url.protocol === 'http:',
        'The address must start with http:// or https://',
      )
      invariant(
        url.username === '' && url.password === '',
        'The address must not contain a password',
      )
      invariant(url.hostname.length > 0, 'The address needs a host name')
      return { url: url.toString(), host: url.hostname }
    },
    byteLength: (text) => Buffer.byteLength(text, 'utf8'),
  }
}
