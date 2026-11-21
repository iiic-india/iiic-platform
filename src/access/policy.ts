import type { Access, AccessResult, Where } from 'payload'

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
  // The one record of a person (docs/04, S2): the office and the owners. Practitioners see their
  // own clients once bookings link the two (M3). Deleting a person is the erasure an owner
  // confirms (docs/05, Privacy), so only owners delete.
  people: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // Append-only (docs/04): the operator reads the log and records the replies people send
  // (docs/06 V1, V2); nobody changes or deletes an entry, not even an owner.
  consents: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: {},
    delete: {},
  },
  // The consent texts are content (docs/05) whose wording decides what a person agreed to:
  // operators read them, owners and editors write them (operators change no policy, docs/05).
  // A text in force never changes; the collection adds that to update and delete.
  consentVersions: {
    read: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'editor'] },
    update: { roles: ['owner', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Written by the server only, never through the API (docs/04, docs/12 §7). Owners read the
  // raw events until Reports aggregates them (M5).
  analyticsEvents: {
    read: { roles: ['owner'] },
    create: {},
    update: {},
    delete: {},
  },
  // The settings global: owners only (docs/04). Pages read the legal information and the flags
  // on the server, past these rules, and only those fields (src/lib/settings/read.ts).
  settings: {
    read: { roles: ['owner'] },
    update: { roles: ['owner'] },
  },
} as const satisfies Record<string, Record<string, Rule>>

/**
 * A rule of the table, narrowed by a condition of the collection's own: whoever the rule lets
 * through reaches only the documents that match `where`, worked out at the time of the request.
 */
export function allowWhere(rule: Rule, where: () => Where): Access {
  const base = allow(rule)
  return async (args) => {
    const result = await base(args)
    if (result === false) return false
    return result === true ? where() : { and: [result, where()] }
  }
}

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
