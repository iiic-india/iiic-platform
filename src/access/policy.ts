import type { Access, AccessResult, FieldAccess, Where } from 'payload'

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
  // The Journal's articles, as pages: anyone reads a published article, the staff who edit
  // content read drafts and earlier versions once they have entered their code; operators edit
  // content, editors own it (docs/05: editors hold "pages, posts, FAQs, media").
  posts: {
    read: { roles: ['owner', 'operator', 'editor'], published: true },
    readVersions: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // The Journal's topics have no drafts: a topic's name and door are public, as on the site.
  topics: {
    read: { anyone: true },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Redirects are content: the staff who edit pages make and change them, and owners and
  // editors remove them (docs/05, Content). Visitors never read them through the API; the
  // site reads them on the server to answer an old address (src/lib/redirects/lookup.ts).
  redirects: {
    read: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // The 404 log (docs/05, Content → Broken links): only the server adds entries, as visitors
  // reach addresses the site does not have; the same staff read them, mark one resolved with a
  // redirect, and owners and editors clear the noise.
  missingPages: {
    read: { roles: ['owner', 'operator', 'editor'] },
    create: {},
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
 * Running, queueing and cancelling jobs through the API (Payload's `/api/payload-jobs/run`):
 * an owner who has entered their two-factor code, and nobody else, until the cron runner brings
 * its own secret (M6). Payload's default would let any signed-in account run them.
 */
export function ownerWithCode({ req: { user } }: { req: { user?: unknown } }): boolean {
  const strategy = (user as { _strategy?: string } | null | undefined)?._strategy
  return strategy === 'totp' && hasRole(user as MaybeStaff, 'owner')
}

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
