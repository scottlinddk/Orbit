# @orbit/integration-ics-calendar

Read-only ICS feeds for the calendar module (ADR 0003).

Today this package only parses. `parseIcs(text, { from, to })` turns feed text into normalized `CalendarEvent`s from `@orbit/domain`, expanding recurrence rules (including EXDATE and RECURRENCE-ID overrides) inside the range. Wall-clock times hold across daylight saving changes. It does no I/O.

The feed is untrusted. Input over `MAX_ICS_BYTES` is refused, a feed that expands past `MAX_EVENTS_PER_PARSE` is refused, a runaway rule drops only its own event, and titles and locations are capped and stripped of control characters.

Not built yet: fetching a feed over HTTP (this needs the shared egress guard from #47 first), storing a source per household, the `IntegrationProvider` adapter, and the widget wiring.

See [architecture overview](../../../docs/architecture/overview.md) for the dependency rules this package must follow.
