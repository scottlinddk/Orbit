# 0008 Opt-in local usage stats

Status: accepted (implementation deferred)

## Context

Success metrics need repeat-use evidence, but a self-hosted app must not phone home.

## Decision

- Off by default.
- When an owner enables it, the instance counts coarse events locally (for example dashboard opens per week and widget types in use). Counters live in the instance's own database.
- Nothing is transmitted automatically. The owner can export a report as JSON, read exactly what it contains, and choose to share it.
- The report schema is documented and contains no user identifiers, names, household content, IP addresses or free text.
- Interview-based evidence complements it, since opt-in samples are small and self-selected.

## Consequences

Numbers will undercount and skew toward engaged users. Treat them as supporting evidence, not as the adoption measure. Implementation waits until the dashboard has real usage to count.
