import type { Access, AccessResult, FieldAccess } from 'payload'

import { hasRole, isActive, ROLES, type MaybeStaff, type Role } from './roles'

/**
 * Who may do what in the admin, collection by collection: docs/05 ("Who uses it") and
 * docs/04 (access per entity). Collections build their access from this table, and the
 * tests hold every role to docs/05, so a permission changes here and nowhere else.
 * - `roles`: the roles that may, on every document;
 * - `self`: any active staff user may, on their own record;
 * - `anyone`: no sign-in needed (public media);
 * - `published`: no sign-in needed for a published document; drafts stay with `roles`, after
 *   the two-factor code;
 * - `active`: no sign-in needed for an active document (a service, a practitioner's profile);
 *   inactive ones stay with `roles`, after the two-factor code.
 * A deactivated account is refused everything (src/access/roles.ts).
 */
export type Rule = {
  roles?: readonly Role[]
  self?: true
  anyone?: true
  published?: true
  active?: true
}

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
  // The questions pages show (docs/05, Content: FAQs), drafted and published as pages are:
  // anyone reads a published question; the staff who edit content read drafts and earlier
  // versions once they have entered their two-factor code. Operators edit content, editors
  // own it.
  faqs: {
    read: { roles: ['owner', 'operator', 'editor'], published: true },
    readVersions: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Practitioners' public profiles (docs/04: S0 public profile, S2 staff; docs/05, Content):
  // anyone reads an active profile, and only its public fields (FIELD_POLICY); the staff who
  // edit content read every profile and keep them; only an owner deletes one.
  practitioners: {
    read: { roles: ['owner', 'operator', 'editor'], active: true },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner'] },
  },
  // Services and prices are an owner's (docs/05: Settings; operators cannot change prices).
  // Anyone reads an active service, and only its public fields (FIELD_POLICY); every staff role
  // reads them all. A service is retired by unticking it, never deleted: bookings and the price
  // history will point at it (M3).
  services: {
    read: { roles: ROLES, active: true },
    create: { roles: ['owner'] },
    update: { roles: ['owner'] },
    delete: {},
  },
} as const satisfies Record<string, Record<string, Rule>>

/**
 * Fields a collection's public read must not hand out, with the staff who may read or set
 * them (docs/04, docs/05). The collection's own rule still applies first.
 */
export type FieldRule = { roles: readonly Role[] }

export const FIELD_POLICY = {
  // A service's prices, their GST and its SAC code: the staff who set, quote or account for
  // them (docs/05). Never a visitor's: no price is shown anywhere while prices_public is off
  // (D-21), and once prices are published the pages draw them on the server (M3). Owners set
  // them, as they set the rest of a service.
  servicePrices: {
    read: { roles: ['owner', 'operator', 'finance'] },
    write: { roles: ['owner'] },
  },
  // A service's booking rules: every staff role reads them; the booking flow reads them on the
  // server (M3).
  serviceBookingRules: {
    read: { roles: ROLES },
    write: { roles: ['owner'] },
  },
  // Which staff account a profile belongs to (S2): the staff who keep profiles see it, and an
  // owner, who manages staff accounts (docs/05), sets it.
  practitionerStaff: {
    read: { roles: ['owner', 'operator', 'editor'] },
    write: { roles: ['owner'] },
  },
} as const satisfies Record<string, { read: FieldRule; write: FieldRule }>

/** Whether a session has entered its two-factor code (payload-totp's strategy). */
function codeEntered(user: MaybeStaff): boolean {
  return (user as { _strategy?: string } | null | undefined)?._strategy === 'totp'
}

/** A Payload access function for one rule of the table. */
export function allow(rule: Rule): Access {
  return ({ req: { user } }): AccessResult => {
    if (rule.anyone) return true
    // A rule that also serves visitors runs without payload-totp's wrapper (Pages.ts), so
    // its staff branch asks for the two-factor code itself; any other session gets the
    // visitors' filter.
    const servesVisitors = Boolean(rule.published || rule.active)
    if (
      rule.roles?.length &&
      hasRole(user, ...rule.roles) &&
      (!servesVisitors || codeEntered(user))
    ) {
      return true
    }
    if (rule.self && user && isActive(user)) return { id: { equals: user.id } }
    if (rule.published) return { _status: { equals: 'published' } }
    if (rule.active) return { active: { equals: true } }
    return false
  }
}

/**
 * A field's access for one rule of FIELD_POLICY: an active staff user in one of its roles, who
 * has entered the two-factor code. A field of a collection that visitors read is checked on
 * that unwrapped read too (payload-totp's wrapper is off for it), so the rule asks for the code
 * itself, as allow() does.
 */
export function allowField(rule: FieldRule): FieldAccess {
  return ({ req: { user } }) => hasRole(user, ...rule.roles) && codeEntered(user)
}
