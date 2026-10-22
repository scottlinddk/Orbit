import { invariant } from './errors.ts'

declare const brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [brand]: B }

export type UserId = Brand<string, 'UserId'>
export type HouseholdId = Brand<string, 'HouseholdId'>
export type DashboardId = Brand<string, 'DashboardId'>
export type InvitationId = Brand<string, 'InvitationId'>
export type FeedId = Brand<string, 'FeedId'>
export type ListId = Brand<string, 'ListId'>
export type ListItemId = Brand<string, 'ListItemId'>
export type CalendarSourceId = Brand<string, 'CalendarSourceId'>
export type ConnectionId = Brand<string, 'ConnectionId'>
export type NotificationEndpointId = Brand<string, 'NotificationEndpointId'>
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
export const FeedId = (value: string) => id<FeedId>('FeedId', value)
export const ListId = (value: string) => id<ListId>('ListId', value)
export const ListItemId = (value: string) => id<ListItemId>('ListItemId', value)
export const CalendarSourceId = (value: string) => id<CalendarSourceId>('CalendarSourceId', value)
export const ConnectionId = (value: string) => id<ConnectionId>('ConnectionId', value)
export const NotificationEndpointId = (value: string) =>
  id<NotificationEndpointId>('NotificationEndpointId', value)
