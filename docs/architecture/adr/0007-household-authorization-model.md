# 0007 Household authorization model

Status: accepted

## Context

Household data is sensitive, and the top security invariant is that one household can never reach another's resources. The model must be simple enough to test exhaustively.

## Decision

- Two fixed roles per household: `owner` and `member`. No role editor (out of MVP scope).
- Permissions are a deny-by-default table in `packages/domain/src/permissions.ts`. Members can view; owners can also manage members and create, edit and delete dashboards.
- Every household-owned resource carries its `householdId`. Access is decided in one place, the `Authorizer` in `packages/application`, which every use case calls before reading or changing anything else.
- **Non-members get `NotFoundError`, not `ForbiddenError`.** A foreign id and an id that does not exist produce an identical error, so ids never confirm that another household's resource exists. Members whose role is too low get `ForbiddenError`.
- A household always keeps at least one owner (domain invariant).
- Access follows membership immediately: removing a member revokes access on their next request, because nothing is cached.

## Testing

`packages/testing` holds the household-isolation kit. It runs every id-taking use case as an outsider and as a plain member and asserts both the error and that state is unchanged. A new household-scoped use case must be added to the kit. The kit was mutation-checked during development: removing a membership check, a role check, or the authorization call in `getDashboard` or `listDashboards` each fails the suite.

## Consequences

- Members cannot edit dashboards yet. If households want collaborative editing, add a permission and a test row, not a new role system.
- Adding a user to a household is by user id and requires the user to exist. An invitation flow will replace this when authentication lands.
- The same kit must be re-run at the HTTP layer once the API exists, since routes can bypass use cases.
