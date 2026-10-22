import type { CalendarEvent, ConnectionKind, MirrorRole, TodoList } from '@orbit/domain'

/** What a person typed to reach the other system, and the credential for it. Both are secrets. */
export interface ConnectionTarget {
  readonly baseUrl: string
  readonly token: string
}

/** Something in the other system that Orbit could mirror. */
export interface DiscoveredEntity {
  /** The other system's own id, for example `calendar.family` in Home Assistant. */
  readonly entityId: string
  readonly role: MirrorRole
  readonly name: string
}

/**
 * A system Orbit can read data from for a household. One implementation per kind, wired in the
 * composition root with the shared egress guard (ADR 0019). The same port will serve Mealie and
 * Grocy.
 *
 * Failures are `IntegrationError` or `EgressDeniedError` with text that is safe to show: it never
 * contains the address or the token. Implementations only read. Writing back is a separate,
 * later decision.
 */
export interface IntegrationProvider {
  readonly kind: ConnectionKind
  /**
   * Checks an address a person typed and returns the URL to use and its `host[:port]`. Throws
   * `InvariantViolation` with a message fit for the owner.
   */
  parseAddress(input: string): { url: string; host: string }
  /** Proves the credential works, and lists the calendars and lists that could be mirrored. */
  discover(target: ConnectionTarget): Promise<DiscoveredEntity[]>
  readCalendar(
    target: ConnectionTarget,
    entityId: string,
    range: { from: Date; to: Date },
  ): Promise<CalendarEvent[]>
  readTodoList(target: ConnectionTarget, entityId: string): Promise<TodoList>
}
