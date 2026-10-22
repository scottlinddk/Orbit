import { z } from 'zod'
import { PlanetError } from './manifest.ts'

export const LOCKFILE_NAME = 'planets.lock'

const entry = z.strictObject({
  version: z.string(),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  /** Digest of the permission lines the administrator approved. An update that adds a capability changes it. */
  permissions: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  installed_at: z.string(),
})

const lockfileSchema = z.strictObject({
  lockfile_version: z.literal(1),
  planets: z.record(z.string(), entry),
})

export type LockEntry = z.infer<typeof entry>
export interface Lockfile {
  readonly lockfile_version: 1
  readonly planets: Readonly<Record<string, LockEntry>>
}

export const emptyLockfile = (): Lockfile => ({ lockfile_version: 1, planets: {} })

export function parseLockfile(text: string): Lockfile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PlanetError(
      `${LOCKFILE_NAME} is not valid JSON. Planets are not loaded until it is fixed.`,
    )
  }
  const result = lockfileSchema.safeParse(json)
  if (!result.success) {
    throw new PlanetError(
      `${LOCKFILE_NAME} is not valid. Planets are not loaded until it is fixed.`,
    )
  }
  return result.data
}

/** Stable output, so the file diffs cleanly and is easy to review. */
export function serializeLockfile(lockfile: Lockfile): string {
  const sorted = Object.fromEntries(
    Object.entries(lockfile.planets).sort(([a], [b]) => (a < b ? -1 : 1)),
  )
  return `${JSON.stringify({ lockfile_version: 1, planets: sorted }, null, 2)}\n`
}

export const withEntry = (lockfile: Lockfile, id: string, value: LockEntry): Lockfile => ({
  lockfile_version: 1,
  planets: { ...lockfile.planets, [id]: value },
})

export function withoutEntry(lockfile: Lockfile, id: string): Lockfile {
  const planets = { ...lockfile.planets }
  delete planets[id]
  return { lockfile_version: 1, planets }
}
