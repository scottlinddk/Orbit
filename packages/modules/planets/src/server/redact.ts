export const REDACTED = '[redacted]'

/** A secret shorter than this could be a common word, and replacing it would mangle real text. */
export const MIN_SECRET_LENGTH = 8

/**
 * Replaces every occurrence of a secret value in `text`. Used on what an upstream server sent
 * back (some APIs echo the key they were called with) and on rendered output, so a secret that
 * entered a response never reaches a template, the database or the page.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text
  // Longest first, so a secret that contains another one is replaced as a whole.
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret.length >= MIN_SECRET_LENGTH) result = result.split(secret).join(REDACTED)
  }
  return result
}

/** Replaces secrets in any JSON value. Keys are redacted too. */
export function redactJson(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return redactSecrets(value, secrets)
  if (Array.isArray(value)) return value.map((v) => redactJson(v, secrets))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [redactSecrets(k, secrets), redactJson(v, secrets)]),
    )
  }
  return value
}
