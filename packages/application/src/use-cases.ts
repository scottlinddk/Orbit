import {
  DashboardId,
  HouseholdId,
  WidgetPlacementId,
  addMember,
  addWidget,
  can,
  changeMemberRole,
  createDashboard,
  createHousehold,
  createFeed,
  createInvitation,
  feedByteLength,
  FeedId,
  invitationStatus,
  isActiveFeed,
  MAX_FEED_BYTES,
  renderFeed,
  InvitationId,
  invariant,
  moveWidget,
  configureWidget,
  resizeWidget,
  removeMember,
  roleOf,
  removeWidget,
  renameDashboard,
  setColumns,
  type Columns,
  type Dashboard,
  type Feed,
  type FeedField,
  type Household,
  type Invitation,
  type User,
  type HouseholdRole,
  type JsonObject,
  type UserId,
  Username,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import type { AccountRepository, Clock, SessionTokens } from './auth-ports.ts'
import { createAuthorizer } from './authorizer.ts'
import { NotFoundError } from './errors.ts'
import type {
  DashboardRepository,
  FeedRepository,
  HouseholdRepository,
  IdGenerator,
  InvitationRepository,
  UserRepository,
} from './ports.ts'

export interface Dependencies {
  users: UserRepository
  accounts: Pick<AccountRepository, 'findCredential'>
  households: HouseholdRepository
  dashboards: DashboardRepository
  invitations: InvitationRepository
  feeds: FeedRepository
  /** Largest feed to accept. Defaults to MAX_FEED_BYTES; tests lower it. */
  maxFeedBytes?: number
  tokens: Pick<SessionTokens, 'generate'>
  clock: Clock
  ids: IdGenerator
}

export type UseCases = ReturnType<typeof createUseCases>

export function createUseCases(deps: Dependencies) {
  const { users, accounts, households, dashboards, invitations, feeds, tokens, clock, ids } = deps
  const maxFeedBytes = deps.maxFeedBytes ?? MAX_FEED_BYTES
  const authorizer = createAuthorizer(households)

  /** Roles that may not see the member list get a household that only contains themselves. */
  function viewFor(actor: Actor, household: Household): Household {
    const role = roleOf(household, actor.userId)
    if (role && can(role, 'household:view-members')) return household
    return { ...household, members: household.members.filter((m) => m.userId === actor.userId) }
  }

  /** Loads a dashboard and authorizes against the household that owns it. */
  async function loadDashboard(
    actor: Actor,
    id: DashboardId,
    action: 'dashboard:view' | 'dashboard:edit' | 'dashboard:delete',
  ): Promise<Dashboard> {
    const dashboard = await dashboards.get(id)
    if (!dashboard) throw new NotFoundError()
    await authorizer.require(actor, dashboard.householdId, action)
    return dashboard
  }

  async function updateDashboard(
    actor: Actor,
    id: DashboardId,
    change: (dashboard: Dashboard) => Dashboard,
  ): Promise<Dashboard> {
    const updated = change(await loadDashboard(actor, id, 'dashboard:edit'))
    await dashboards.save(updated)
    return updated
  }

  return {
    /** The signed-in user's own profile. */
    async getProfile(userId: UserId): Promise<User> {
      const user = await users.get(userId)
      if (!user) throw new NotFoundError()
      return user
    },

    async createHousehold(actor: Actor, input: { name: string }): Promise<Household> {
      const household = createHousehold({
        id: HouseholdId(ids.next()),
        name: input.name,
        ownerId: actor.userId,
      })
      await households.save(household)
      await dashboards.save(starterDashboard(household.id, ids))
      return household
    },

    /** What the actor may see: roles without `household:view-members` only see themselves. */
    async listHouseholds(actor: Actor): Promise<Household[]> {
      return (await households.listForUser(actor.userId)).map((h) => viewFor(actor, h))
    },

    async getHousehold(actor: Actor, id: HouseholdId): Promise<Household> {
      return viewFor(actor, await authorizer.require(actor, id, 'household:view'))
    },

    /**
     * Owners change anyone's role, their own included. The last owner cannot be demoted, so a
     * household always has someone who can manage it.
     */
    async changeHouseholdMemberRole(
      actor: Actor,
      id: HouseholdId,
      userId: UserId,
      role: HouseholdRole,
    ): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      if (roleOf(household, userId) === undefined) throw new NotFoundError()
      const updated = changeMemberRole(household, userId, role)
      await households.save(updated)
      return updated
    },

    async addHouseholdMember(
      actor: Actor,
      id: HouseholdId,
      input: { userId: UserId; role?: HouseholdRole | undefined },
    ): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      if (!(await users.get(input.userId))) throw new NotFoundError()
      const updated = addMember(household, input.userId, input.role)
      await households.save(updated)
      return updated
    },

    /** Adds an existing account by login name. Unknown names look the same as foreign ids. */
    async addHouseholdMemberByUsername(
      actor: Actor,
      id: HouseholdId,
      input: { username: string; role?: HouseholdRole | undefined },
    ): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      const credential = await accounts.findCredential(Username(input.username))
      if (!credential) throw new NotFoundError()
      const updated = addMember(household, credential.userId, input.role)
      await households.save(updated)
      return updated
    },

    async removeHouseholdMember(actor: Actor, id: HouseholdId, userId: UserId): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      const updated = removeMember(household, userId)
      await households.save(updated)
      return updated
    },

    /**
     * The raw token is returned here and never again: only its hash is stored. The owner shares
     * it as a link, and the invitee chooses their own username and password with it.
     */
    async createInvitation(
      actor: Actor,
      householdId: HouseholdId,
      input: { role?: HouseholdRole | undefined; expiresInDays?: number | undefined },
    ): Promise<{ invitation: Invitation; token: string }> {
      await authorizer.require(actor, householdId, 'household:manage-members')
      const { token, tokenHash } = tokens.generate()
      const invitation = createInvitation({
        id: InvitationId(ids.next()),
        householdId,
        role: input.role ?? 'member',
        tokenHash,
        createdBy: actor.userId,
        now: clock.now(),
        ttlDays: input.expiresInDays,
      })
      await invitations.create(invitation)
      return { invitation, token }
    },

    /** Invitations that can still be used. Accepted, revoked and expired ones are history. */
    async listInvitations(actor: Actor, householdId: HouseholdId): Promise<Invitation[]> {
      await authorizer.require(actor, householdId, 'household:manage-members')
      const now = clock.now()
      return (await invitations.listForHousehold(householdId)).filter(
        (i) => invitationStatus(i, now) === 'pending',
      )
    },

    /** The id is looked up inside the household, so another household's invitation id is not found. */
    async revokeInvitation(
      actor: Actor,
      householdId: HouseholdId,
      invitationId: InvitationId,
    ): Promise<void> {
      await authorizer.require(actor, householdId, 'household:manage-members')
      const invitation = await invitations.get(invitationId)
      if (!invitation || invitation.householdId !== householdId) throw new NotFoundError()
      const now = clock.now()
      invariant(
        ['pending', 'expired'].includes(invitationStatus(invitation, now)) &&
          (await invitations.revoke(invitationId, now)),
        'This invitation was already used or revoked',
      )
    },

    /**
     * The raw token is returned here and never again: only its hash is stored. The owner pastes
     * it into the display's settings. A feed that would be too big to publish is refused now, so
     * the owner finds out while setting it up and not when the display goes blank.
     */
    async createFeed(
      actor: Actor,
      householdId: HouseholdId,
      input: {
        name: string
        fields: readonly FeedField[]
        dashboardId?: DashboardId | undefined
      },
    ): Promise<{ feed: Feed; token: string }> {
      const household = await authorizer.require(actor, householdId, 'feed:manage')
      // A dashboard of another household looks exactly like one that does not exist.
      const dashboard =
        input.dashboardId === undefined ? undefined : await dashboards.get(input.dashboardId)
      if (input.dashboardId !== undefined && dashboard?.householdId !== householdId)
        throw new NotFoundError()
      const { token, tokenHash } = tokens.generate()
      const feed = createFeed({
        id: FeedId(ids.next()),
        householdId,
        name: input.name,
        fields: input.fields,
        dashboardId: input.dashboardId,
        tokenHash,
        createdBy: actor.userId,
        now: clock.now(),
      })
      invariant(
        feedByteLength(renderFeed(feed, { household, dashboard })) <= maxFeedBytes,
        'This feed would be too large for a display. Choose fewer fields.',
      )
      await feeds.create(feed)
      return { feed, token }
    },

    /** Feeds that can still be read. Revoked ones are history. */
    async listFeeds(actor: Actor, householdId: HouseholdId): Promise<Feed[]> {
      await authorizer.require(actor, householdId, 'feed:manage')
      return (await feeds.listForHousehold(householdId)).filter(isActiveFeed)
    },

    /** The id is looked up inside the household, so another household's feed id is not found. */
    async revokeFeed(actor: Actor, householdId: HouseholdId, feedId: FeedId): Promise<void> {
      await authorizer.require(actor, householdId, 'feed:manage')
      const feed = await feeds.get(feedId)
      if (!feed || feed.householdId !== householdId) throw new NotFoundError()
      invariant(await feeds.revoke(feedId, clock.now()), 'This feed was already revoked')
    },

    async createDashboard(
      actor: Actor,
      householdId: HouseholdId,
      input: { name: string; columns?: Columns | undefined },
    ): Promise<Dashboard> {
      await authorizer.require(actor, householdId, 'dashboard:create')
      const dashboard = createDashboard({
        id: DashboardId(ids.next()),
        householdId,
        name: input.name,
        ...(input.columns === undefined ? {} : { columns: input.columns }),
      })
      await dashboards.save(dashboard)
      return dashboard
    },

    async listDashboards(actor: Actor, householdId: HouseholdId): Promise<Dashboard[]> {
      await authorizer.require(actor, householdId, 'dashboard:view')
      return dashboards.listForHousehold(householdId)
    },

    getDashboard(actor: Actor, id: DashboardId): Promise<Dashboard> {
      return loadDashboard(actor, id, 'dashboard:view')
    },

    renameDashboard(actor: Actor, id: DashboardId, name: string): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => renameDashboard(d, name))
    },

    setDashboardColumns(actor: Actor, id: DashboardId, columns: Columns): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => setColumns(d, columns))
    },

    addWidget(
      actor: Actor,
      id: DashboardId,
      input: {
        type: string
        span?: number | undefined
        config?: JsonObject | undefined
        index?: number | undefined
      },
    ): Promise<Dashboard> {
      const widget = {
        id: WidgetPlacementId(ids.next()),
        type: input.type,
        ...(input.span === undefined ? {} : { span: input.span }),
        ...(input.config === undefined ? {} : { config: input.config }),
      }
      return updateDashboard(actor, id, (d) => addWidget(d, widget, input.index))
    },

    removeWidget(actor: Actor, id: DashboardId, widgetId: WidgetPlacementId): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => removeWidget(d, widgetId))
    },

    moveWidget(
      actor: Actor,
      id: DashboardId,
      widgetId: WidgetPlacementId,
      toIndex: number,
    ): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => moveWidget(d, widgetId, toIndex))
    },

    resizeWidget(
      actor: Actor,
      id: DashboardId,
      widgetId: WidgetPlacementId,
      span: number,
    ): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => resizeWidget(d, widgetId, span))
    },

    configureWidget(
      actor: Actor,
      id: DashboardId,
      widgetId: WidgetPlacementId,
      config: JsonObject,
    ): Promise<Dashboard> {
      return updateDashboard(actor, id, (d) => configureWidget(d, widgetId, config))
    },

    async deleteDashboard(actor: Actor, id: DashboardId): Promise<void> {
      await loadDashboard(actor, id, 'dashboard:delete')
      await dashboards.delete(id)
    },
  }
}

/**
 * What a new household starts with, so the first screen is not empty. It is a normal dashboard:
 * the owner can edit or delete it. The widget is named by its type string only. It needs no
 * account or data source, and no widget that shows sample data belongs here.
 */
export const STARTER_DASHBOARD = { name: 'Home', widgetType: 'calendar.today' } as const

function starterDashboard(householdId: HouseholdId, ids: IdGenerator): Dashboard {
  const empty = createDashboard({
    id: DashboardId(ids.next()),
    householdId,
    name: STARTER_DASHBOARD.name,
  })
  return addWidget(empty, {
    id: WidgetPlacementId(ids.next()),
    type: STARTER_DASHBOARD.widgetType,
  })
}
