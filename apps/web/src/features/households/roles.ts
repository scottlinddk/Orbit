export type Role = 'owner' | 'member' | 'child' | 'device'
export type InvitableRole = Exclude<Role, 'owner'>

const LABELS: Record<Role, string> = {
  owner: 'Owner',
  member: 'Member',
  child: 'Child',
  device: 'Device',
}

export const roleLabel = (role: Role) => LABELS[role]

/** What each role can do, in the words shown next to the choice. */
export const ROLE_OPTIONS: readonly { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner (manages everything)' },
  { value: 'member', label: 'Member (views, edits lists)' },
  { value: 'child', label: 'Child (views, edits lists, cannot see members)' },
  { value: 'device', label: 'Device (shared screen, view only)' },
]

export const INVITE_ROLE_OPTIONS = ROLE_OPTIONS.filter((o) => o.value !== 'owner') as readonly {
  value: InvitableRole
  label: string
}[]

export const isRole = (value: string): value is Role => ROLE_OPTIONS.some((o) => o.value === value)
export const isInvitableRole = (value: string): value is InvitableRole =>
  INVITE_ROLE_OPTIONS.some((o) => o.value === value)
