import type { FieldAccess } from 'payload'

/** Staff roles from docs/05-admin-panel.md ("Who uses it"). */
export const ROLES = ['owner', 'operator', 'practitioner', 'editor', 'finance'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  operator: 'Operator',
  practitioner: 'Practitioner',
  editor: 'Editor',
  finance: 'Finance',
}

export type MaybeStaff =
  | { id?: number | string; roles?: readonly string[] | null; active?: boolean | null }
  | null
  | undefined

/** A signed-in staff user whose account is active. A deactivated account can do nothing. */
export function isActive(user: MaybeStaff): boolean {
  return Boolean(user) && user?.active !== false
}

/** Whether an active staff user holds one of the roles. */
export function hasRole(user: MaybeStaff, ...roles: Role[]): boolean {
  if (!isActive(user) || !user?.roles?.length) return false
  return user.roles.some((role) => (roles as readonly string[]).includes(role))
}

/** Field-level: owners only. */
export const isOwnerField: FieldAccess = ({ req: { user } }) => hasRole(user, 'owner')
