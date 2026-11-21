import type { Access, AccessResult } from 'payload'

import { hasRole, isActive, type Role } from './roles'

/**
 * Who may do what in the admin, collection by collection: docs/05 ("Who uses it") and
 * docs/04 (access per entity). Collections build their access from this table, and the
 * tests hold every role to docs/05, so a permission changes here and nowhere else.
 * - `roles`: the roles that may, on every document;
 * - `self`: any active staff user may, on their own record;
 * - `anyone`: no sign-in needed (public media);
 * - `published`: no sign-in needed for a published document; drafts stay with `roles`, after
 *   the two-factor code.
 * A deactivated account is refused everything (src/access/roles.ts).
 */
export type Rule = { roles?: readonly Role[]; self?: true; anyone?: true; published?: true }

export const POLICY = {
  users: {
    read: { roles: ['owner'], self: true },
    create: { roles: ['owner'] },
    update: { roles: ['owner'], self: true },
    // Staff are deactivated, never deleted, so the audit trail keeps its actors (docs/04).
    delete: {},
    unlock: { roles: ['owner'] },
  },
  media: {
    read: { anyone: true },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Anyone reads a published page; the staff who edit content read drafts too, once they have
  // entered their two-factor code. Operators edit content, editors own it (docs/05).
  pages: {
    read: { roles: ['owner', 'operator', 'editor'], published: true },
    // Versions hold every draft: the same staff as drafts.
    readVersions: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Owners read it; entries are written only by the server, never changed (D-43).
  auditLog: {
    read: { roles: ['owner'] },
    create: {},
    update: {},
    delete: {},
  },
} as const satisfies Record<string, Record<string, Rule>>

/** A Payload access function for one rule of the table. */
export function allow(rule: Rule): Access {
  return ({ req: { user } }): AccessResult => {
    if (rule.anyone) return true
    // A rule that also serves visitors runs without payload-totp's wrapper (Pages.ts), so
    // its staff branch asks for the two-factor code itself; any other session gets the
    // published filter.
    const codeEntered = (user as { _strategy?: string } | null | undefined)?._strategy === 'totp'
    if (rule.roles?.length && hasRole(user, ...rule.roles) && (!rule.published || codeEntered)) {
      return true
    }
    if (rule.self && user && isActive(user)) return { id: { equals: user.id } }
    if (rule.published) return { _status: { equals: 'published' } }
    return false
  }
}
