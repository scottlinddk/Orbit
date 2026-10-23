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
- Adding an existing account to a household is by user id or username and requires the account to exist. People without an account join through an invitation ([ADR 0015](0015-household-invitations.md)), which uses the same `household:manage-members` permission and is covered by the isolation kit.
- The same kit must be re-run at the HTTP layer once the API exists, since routes can bypass use cases.

## Amendment 2026-10-22: four roles (issue 15)

The two-role model above held while nothing in the household needed finer limits. Child accounts and shared screens do, so there are now four fixed roles. There is still no role editor: the matrix is code, and a new capability is a new action plus a test row.

| Action                            | owner | member | child | device |
| --------------------------------- | :---: | :----: | :---: | :----: |
| `household:view` (name, own role) |  yes  |  yes   |  yes  |  yes   |
| `household:view-members`          |  yes  |  yes   |  no   |   no   |
| `household:manage-members`        |  yes  |   no   |  no   |   no   |
| `dashboard:view`                  |  yes  |  yes   |  yes  |  yes   |
| `dashboard:create/edit/delete`    |  yes  |   no   |  no   |   no   |
| `calendar:view`, `list:view`      |  yes  |  yes   |  yes  |  yes   |
| `list:edit`                       |  yes  |  yes   |  yes  |   no   |
| `feed:manage`                     |  yes  |   no   |  no   |   no   |

- **device** is a shared screen, such as a wall display. It is a normal account that signs in once on that screen and can only show things. It reads the household name so the app can find its dashboards, but not who else is a member.
- **child** is a member without the member list. It also cannot manage anything.
- **Redaction, not a new error.** A role without `household:view-members` still gets the household, but its member list contains only itself. This applies to both `GET /households` and `GET /households/{id}`.
- **Owners are never invited.** An invitation (and add-by-username through the API) can carry `member`, `child` or `device`. The only way to become an owner is to create the household, or to be promoted by an owner with `PATCH /households/{id}/members/{userId}`.
- **Last owner.** Changing a role follows the same invariant as removal: a household keeps at least one owner. Promoting a second owner first is the way to hand over a household.
- **Storage.** The `role` check constraints on `household_members` and `invitations` were rebuilt in a migration. Existing rows keep their roles.
- **Tests.** The isolation kit and the HTTP isolation suite now also run as a child and as a device. Every forbidden operation is asserted through the API, and role changes take effect on the next request.
- **Not decided here.** A kiosk sign-in without a password (a long-lived device token) is a separate decision, tracked with the kiosk mode issue. Until then a device account signs in like any other account.
