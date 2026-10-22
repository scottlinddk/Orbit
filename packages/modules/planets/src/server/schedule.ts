import type { PlanetManifest } from './manifest.ts'

export type RefreshPolicy = PlanetManifest['refresh']

/**
 * When a placement should refresh next. Pure: the clock and the random source are arguments.
 *
 * - The interval is never shorter than `min_interval_seconds`, whatever the manifest asks.
 * - After a failure the wait doubles with every consecutive failure, up to `backoff_max_seconds`.
 *   The last good data stays on screen meanwhile (the caller keeps it).
 * - Jitter spreads placements out, so a restart does not make every Planet fetch at once.
 *   It adds up to `jitter_percent` of the wait and never makes it shorter than the floor.
 */
export function nextRefreshAt(input: {
  policy: RefreshPolicy
  now: Date
  consecutiveFailures: number
  /** A number in [0, 1). */
  random: number
}): Date {
  const { policy, consecutiveFailures } = input
  const base = Math.max(policy.interval_seconds, policy.min_interval_seconds)
  const backedOff =
    consecutiveFailures > 0
      ? Math.min(base * 2 ** Math.min(consecutiveFailures, 16), policy.backoff_max_seconds)
      : base
  const wait = Math.max(backedOff, policy.min_interval_seconds)
  const jitter = wait * (policy.jitter_percent / 100) * input.random
  return new Date(input.now.getTime() + Math.round((wait + jitter) * 1000))
}
