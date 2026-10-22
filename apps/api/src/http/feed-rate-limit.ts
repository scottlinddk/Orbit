export interface FeedRateLimitOptions {
  /** Length of one counting window. */
  windowMs: number
  /** Requests per window for one feed token, valid or not. */
  perToken: number
  /** Requests per window for one client address, valid or not. */
  perClient: number
  /** Failed requests (unknown, revoked, malformed token) per window for one client address. */
  failuresPerClient: number
  now: () => number
}

export const defaultFeedRateLimit: FeedRateLimitOptions = {
  windowMs: 60_000,
  // A display polls every 5 to 15 minutes. These leave room for an owner testing the setup.
  perToken: 30,
  perClient: 60,
  failuresPerClient: 10,
  now: Date.now,
}

/**
 * A fixed-window counter per key. In memory on purpose: Orbit runs as one process (ADR 0012),
 * and a restart only resets the windows. Keys are hashed or addresses, never raw tokens.
 */
export class WindowCounter {
  readonly #hits = new Map<string, { windowStart: number; count: number }>()

  readonly #windowMs: number
  readonly #now: () => number

  constructor(windowMs: number, now: () => number) {
    this.#windowMs = windowMs
    this.#now = now
  }

  /** Counts one hit and returns the count in the current window. */
  hit(key: string): number {
    const now = this.#now()
    const entry = this.#hits.get(key)
    if (!entry || now - entry.windowStart >= this.#windowMs) {
      this.#sweep(now)
      this.#hits.set(key, { windowStart: now, count: 1 })
      return 1
    }
    entry.count += 1
    return entry.count
  }

  count(key: string): number {
    const entry = this.#hits.get(key)
    return entry && this.#now() - entry.windowStart < this.#windowMs ? entry.count : 0
  }

  // Bounds memory: expired windows are dropped when a new one starts.
  #sweep(now: number) {
    if (this.#hits.size < 1024) return
    for (const [key, entry] of this.#hits)
      if (now - entry.windowStart >= this.#windowMs) this.#hits.delete(key)
  }
}
