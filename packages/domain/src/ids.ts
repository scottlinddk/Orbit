import { invariant } from './errors.ts'

declare const brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type UserId = Brand<string, 'UserId'>
export type HouseholdId = Brand<string, 'HouseholdId'>
export type DashboardId = Brand<string, 'DashboardId'>
export type InvitationId = Brand<string, 'InvitationId'>
export type WidgetPlacementId = Brand<string, 'WidgetPlacementId'>

function id<T extends string>(kind: string, value: string): T {
  invariant(value.length > 0 && value.length <= 128, `${kind} must be 1 to 128 characters`)
  return value as T
}

export const UserId = (value: string) => id<UserId>('UserId', value)
export const HouseholdId = (value: string) => id<HouseholdId>('HouseholdId', value)
export const DashboardId = (value: string) => id<DashboardId>('DashboardId', value)
export const WidgetPlacementId = (value: string) =>
  id<WidgetPlacementId>('WidgetPlacementId', value)
export const InvitationId = (value: string) => id<InvitationId>('InvitationId', value)
