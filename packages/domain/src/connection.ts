import { invariant } from './errors.ts'
import type { ConnectionId, HouseholdId, UserId } from './ids.ts'

/** The systems Orbit can mirror data from. Mealie and Grocy follow the same shape. */
export const CONNECTION_KINDS = ['homeassistant'] as const
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

export const MAX_CONNECTIONS_PER_HOUSEHOLD = 5
export const MAX_MIRRORS_PER_CONNECTION = 20
export const MAX_CONNECTION_NAME = 80

export const MIRROR_ROLES = ['calendar', 'todo'] as const
export type MirrorRole = (typeof MIRROR_ROLES)[number]

/**
 * One thing a connection mirrors: a calendar or a to-do list in the other system. `entityId` is
 * that system's own id (`calendar.family` in Home Assistant). The name is kept so a list or
 * calendar can be shown without asking the other system.
 */
export interface Mirror {
  readonly entityId: string
  readonly role: MirrorRole
  readonly name: string
}

/**
 * A household's link to another self-hosted system. The base address and the access token are
 * credentials of that system and live in the SecretStore. Only the host is kept here, so people
 * can tell connections apart.
 */
export interface Connection {
  readonly id: ConnectionId
  readonly householdId: HouseholdId
  readonly kind: ConnectionKind
  readonly name: string
  /** `host[:port]` of the base address. Never the path or anything secret. */
  readonly host: string
  readonly mirrors: readonly Mirror[]
  readonly createdBy: UserId
  readonly createdAt: Date
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/

function validMirror(mirror: Mirror): Mirror {
  invariant((MIRROR_ROLES as readonly string[]).includes(mirror.role), 'Unknown kind of mirror')
  invariant(
    ENTITY_ID.test(mirror.entityId) && mirror.entityId.length <= 100,
    'That is not a valid entity id',
  )
  const name = mirror.name.trim()
  invariant(
    name.length > 0 && name.length <= MAX_CONNECTION_NAME,
    'Name must be 1 to 80 characters',
  )
  return { entityId: mirror.entityId, role: mirror.role, name }
}

export function createConnection(input: {
  id: ConnectionId
  householdId: HouseholdId
  kind: ConnectionKind
  name: string
  host: string
  createdBy: UserId
  now: Date
}): Connection {
  invariant((CONNECTION_KINDS as readonly string[]).includes(input.kind), 'Unknown connection kind')
  const name = input.name.trim()
  invariant(
    name.length > 0 && name.length <= MAX_CONNECTION_NAME,
    'Connection name must be 1 to 80 characters',
  )
  return {
    id: input.id,
    householdId: input.householdId,
    kind: input.kind,
    name,
    host: input.host,
    mirrors: [],
    createdBy: input.createdBy,
    createdAt: input.now,
  }
}

/** Replaces the set of mirrored entities. Duplicates are refused rather than silently merged. */
export function withMirrors(connection: Connection, mirrors: readonly Mirror[]): Connection {
  invariant(
    mirrors.length <= MAX_MIRRORS_PER_CONNECTION,
    `A connection mirrors at most ${MAX_MIRRORS_PER_CONNECTION} things`,
  )
  const checked = mirrors.map(validMirror)
  invariant(
    new Set(checked.map((m) => m.entityId)).size === checked.length,
    'The same entity was chosen twice',
  )
  return { ...connection, mirrors: checked }
}

/**
 * Mirrored calendars and lists have no row of their own, so their id is built from the
 * connection and the entity: `<connectionId>:<entityId>`. Ids Orbit generates never contain a
 * colon, so the two cannot be confused.
 */
export const externalId = (connectionId: ConnectionId, entityId: string) =>
  `${connectionId}:${entityId}`

export function parseExternalId(
  id: string,
): { connectionId: string; entityId: string } | undefined {
  const at = id.indexOf(':')
  if (at <= 0 || at === id.length - 1) return undefined
  return { connectionId: id.slice(0, at), entityId: id.slice(at + 1) }
}
