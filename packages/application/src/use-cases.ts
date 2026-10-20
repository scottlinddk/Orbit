import {
  DashboardId,
  HouseholdId,
  WidgetPlacementId,
  addMember,
  addWidget,
  createDashboard,
  createHousehold,
  moveWidget,
  removeMember,
  removeWidget,
  renameDashboard,
  setColumns,
  type Columns,
  type Dashboard,
  type Household,
  type HouseholdRole,
  type JsonObject,
  type UserId,
} from '@orbit/domain'
import type { Actor } from './actor.ts'
import { createAuthorizer } from './authorizer.ts'
import { NotFoundError } from './errors.ts'
import type {
  DashboardRepository,
  HouseholdRepository,
  IdGenerator,
  UserRepository,
} from './ports.ts'

export interface Dependencies {
  users: UserRepository
  households: HouseholdRepository
  dashboards: DashboardRepository
  ids: IdGenerator
}

export type UseCases = ReturnType<typeof createUseCases>

export function createUseCases(deps: Dependencies) {
  const { users, households, dashboards, ids } = deps
  const authorizer = createAuthorizer(households)

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
    async createHousehold(actor: Actor, input: { name: string }): Promise<Household> {
      const household = createHousehold({
        id: HouseholdId(ids.next()),
        name: input.name,
        ownerId: actor.userId,
      })
      await households.save(household)
      return household
    },

    listHouseholds(actor: Actor): Promise<Household[]> {
      return households.listForUser(actor.userId)
    },

    getHousehold(actor: Actor, id: HouseholdId): Promise<Household> {
      return authorizer.require(actor, id, 'household:view')
    },

    async addHouseholdMember(
      actor: Actor,
      id: HouseholdId,
      input: { userId: UserId; role?: HouseholdRole },
    ): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      if (!(await users.get(input.userId))) throw new NotFoundError()
      const updated = addMember(household, input.userId, input.role)
      await households.save(updated)
      return updated
    },

    async removeHouseholdMember(actor: Actor, id: HouseholdId, userId: UserId): Promise<Household> {
      const household = await authorizer.require(actor, id, 'household:manage-members')
      const updated = removeMember(household, userId)
      await households.save(updated)
      return updated
    },

    async createDashboard(
      actor: Actor,
      householdId: HouseholdId,
      input: { name: string; columns?: Columns },
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
      input: { type: string; span?: number; config?: JsonObject; index?: number },
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

    async deleteDashboard(actor: Actor, id: DashboardId): Promise<void> {
      await loadDashboard(actor, id, 'dashboard:delete')
      await dashboards.delete(id)
    },
  }
}
