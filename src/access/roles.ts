import type { Access, FieldAccess } from 'payload'

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

type MaybeStaff = { roles?: readonly string[] | null } | null | undefined

export function hasRole(user: MaybeStaff, ...roles: Role[]): boolean {
  if (!user?.roles?.length) return false
  return user.roles.some((role) => (roles as readonly string[]).includes(role))
}

/** Any signed-in staff user. */
export const isStaff: Access = ({ req: { user } }) => Boolean(user)

/** Owners only. */
export const isOwner: Access = ({ req: { user } }) => hasRole(user, 'owner')

/** Field-level: owners only. */
export const isOwnerField: FieldAccess = ({ req: { user } }) => hasRole(user, 'owner')

/** Owners, or the signed-in user acting on their own record. */
export const isOwnerOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'owner')) return true
  return { id: { equals: user.id } }
}
