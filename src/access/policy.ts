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
 * - `statusPublished`: no sign-in needed for a document whose own status says published (a
 *   review, which has its own life rather than drafts); the rest stay with `roles`, after the
 *   two-factor code.
 * - `ownPractitioner`: a practitioner reaches only the documents whose `practitioner` is their
 *   own profile (the profile's `staff` is their account): their bookings, working hours,
 *   calendar connection and busy times (docs/05: "own calendar and availability, own clients'
 *   bookings").
 * - `ownClients`: a practitioner reaches only the people who have a booking with them, through
 *   the person's bookings (the owner's rule of 22 November 2026); FIELD_POLICY.personRecord keeps
 *   every field but the name, mobile and email from them.
 * - `author`: an active staff user who has entered the two-factor code reaches only the documents
 *   they wrote (`author` is their account): session notes (D-11; docs/18 §3). No role reaches
 *   another author's documents, an owner's included.
 * A deactivated account is refused everything (src/access/roles.ts).
 */
export type Rule = {
  roles?: readonly Role[]
  self?: true
  anyone?: true
  published?: true
  active?: true
  statusPublished?: true
  ownPractitioner?: true
  ownClients?: true
  author?: true
}

/** The query a practitioner's own documents answer: their profile's staff account is theirs. */
export const OWN_PRACTITIONER_PATH = 'practitioner.staff'

/** The query a practitioner's own clients answer: a booking of theirs names the person. */
export const OWN_CLIENTS_PATH = `bookings.${OWN_PRACTITIONER_PATH}`

/** The query an author's own documents answer: the account that wrote them. */
export const OWN_AUTHOR_PATH = 'author'

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
  // The one record of a person (docs/04, S2): the office and the owners. A practitioner reads the
  // people who have a booking with them, and of those only the name, mobile and email
  // (FIELD_POLICY.personRecord; the owner's rule of 22 November 2026). Deleting a person is the
  // erasure an owner confirms (docs/05, Privacy), so only owners delete.
  people: {
    read: { roles: ['owner', 'operator'], ownClients: true },
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
  // The search index (docs/04 `search_index`; src/plugins/searchIndex.ts): a copy of what is
  // published, so anyone reads it, as /search does. Only the server adds entries, as documents
  // are published, changed and unpublished. The staff who edit content may change an entry's
  // priority; owners and editors, who remove content (docs/05), may also rebuild the index with
  // the admin's "Reindex", which needs both.
  searchIndex: {
    read: { anyone: true },
    create: {},
    update: { roles: ['owner', 'operator', 'editor'] },
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
  // Reviews (docs/04 `testimonials`, S2 until published; docs/05, Proof): the operator moderates
  // (imports, screens, records the writer's reply, pins, withdraws) and owners publish, which
  // the collection checks itself (src/collections/Testimonials.ts). Anyone reads a published
  // review, and only its published fields (FIELD_POLICY). Editors write pages, not client
  // records (docs/05), so they read reviews as a visitor does. Only an owner deletes one.
  testimonials: {
    read: { roles: ['owner', 'operator'], statusPublished: true },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },

  // ---- Booking and payments (M3; docs/16-booking-and-payments-design.md) ----

  // Bookings (docs/04, S2): the office and the owners; a practitioner reads their own and marks
  // attendance on them (docs/05). Created by the booking flow on the server, or by the office
  // for a client. Never deleted: a booking is cancelled, and retention removes it (O5).
  bookings: {
    read: { roles: ['owner', 'operator'], ownPractitioner: true },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'], ownPractitioner: true },
    delete: {},
  },
  // The prices a service's options had, and when (docs/04 `price_history`): written by the server
  // when an owner changes a price; read by the staff who see prices (FIELD_POLICY.servicePrices).
  priceHistory: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: {},
    update: {},
    delete: {},
  },
  // Working hours and their exceptions (docs/05, Calendar): the office keeps everyone's, a
  // practitioner adds and changes their own. A practitioner's new entry is held to their own
  // profile by the collection's hook (src/lib/booking/availabilityHooks.ts, docs/16 §12).
  availabilityRules: {
    read: { roles: ['owner', 'operator'], ownPractitioner: true },
    create: { roles: ['owner', 'operator', 'practitioner'] },
    update: { roles: ['owner', 'operator'], ownPractitioner: true },
    delete: { roles: ['owner', 'operator'], ownPractitioner: true },
  },
  availabilityExceptions: {
    read: { roles: ['owner', 'operator'], ownPractitioner: true },
    create: { roles: ['owner', 'operator', 'practitioner'] },
    update: { roles: ['owner', 'operator'], ownPractitioner: true },
    delete: { roles: ['owner', 'operator'], ownPractitioner: true },
  },
  // A practitioner's Google Calendar link (D-22): an owner connects and disconnects it (docs/05,
  // Settings → integrations); the office and the practitioner see its state.
  calendarConnections: {
    read: { roles: ['owner', 'operator'], ownPractitioner: true },
    create: { roles: ['owner'] },
    update: { roles: ['owner'] },
    delete: { roles: ['owner'] },
  },
  // Busy times copied from a practitioner's calendar, start and end only (D-22): written by the
  // server alone, read by whoever sees that practitioner's calendar.
  busyBlocks: {
    read: { roles: ['owner', 'operator'], ownPractitioner: true },
    create: {},
    update: {},
    delete: {},
  },
  // Fixed-time sessions (docs/04 `events`: the course info sessions): anyone reads an active one's
  // public fields, as the booking flow shows its times; the office keeps them; owners delete.
  events: {
    read: { roles: ['owner', 'operator', 'practitioner'], active: true },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // Payments (docs/04, S2): the gateway's truth, written by the server alone from verified
  // webhooks, server-side verification and reconciliation (CLAUDE.md #5). The office and finance
  // read them; a practitioner sees only paid or unpaid, on the booking (docs/05).
  payments: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: {},
    update: {},
    delete: {},
  },
  // Each gateway event once (docs/04: "stored by provider event id and processed once"): written
  // by the webhook and the polling job only; owners and finance read them to trace a payment.
  gatewayEvents: {
    read: { roles: ['owner', 'finance'] },
    create: {},
    update: {},
    delete: {},
  },
  // Refunds (docs/05, Money): the office requests one, an owner approves one above the threshold
  // (the collection checks who approves, docs/16 §5), finance reads them. Never deleted.
  refunds: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: {},
  },
  // The mirror of the documents in Zoho Books (D-13; docs/04 `invoices`, S2 · finance, owner):
  // written by the server alone, after Zoho Books has issued each one.
  invoices: {
    read: { roles: ['owner', 'finance'] },
    create: {},
    update: {},
    delete: {},
  },

  // ---- The pipeline (M4; docs/17-pipeline-design.md §2) ----

  // Organisations (docs/04, S1 · operator, owner, finance): the office keeps them, finance reads
  // the billing details for invoices; only an owner deletes one. Editors and practitioners hold
  // no client or lead data (docs/05).
  organisations: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // Leads (docs/04, S1; docs/05: the operator runs leads): the office and the owners. A public
  // form's lead is made by the server, after the person's consent is recorded.
  leads: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // A lead's timeline (docs/04 `lead_activities`): written once, never changed, so the record of
  // who did what stays as it was; a slip is put right with a new note. Owners remove an entry
  // (an erasure, or something entered on the wrong lead).
  leadActivities: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: {},
    delete: { roles: ['owner'] },
  },
  // Work for a person (docs/06, Engine rules: Ownership; Today in M5): the office and the owners.
  tasks: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // What a public form received (S2: it holds the contact details as typed): made by the server
  // alone, after the consent is recorded; the office reads it and may mark it as spam, nothing
  // else (the collection's fields are the server's). Only an owner deletes one.
  enquiries: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // Proposals (docs/04; docs/05 "Send a proposal"): the office drafts and sends them; their fees
  // are an owner's (FIELD_POLICY.proposalFees: operators change no price, docs/05); finance reads
  // them, as engagements are invoiced from them. Only an owner deletes one.
  proposals: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // A proposal as it was frozen, printed and sent: written by the server alone (the proposal
  // builder's actions check the user and role first), never changed by hand, never deleted.
  proposalVersions: {
    read: { roles: ['owner', 'operator', 'finance'] },
    create: {},
    update: {},
    delete: {},
  },

  // ---- The admin experience (M5; docs/18-admin-experience-design.md) ----

  // Session notes (docs/04 `session_notes`, S3; D-11; CLAUDE.md #3): read by their author only,
  // with the two-factor code; no role reads another author's note, an owner's included. The body
  // is encrypted by the server, so nobody writes a note through the API: the notes module writes
  // and reads them after its own checks (src/lib/notes/, docs/18 §3), and every read is audited.
  // Never deleted through the API; erasing a person removes their notes (docs/04, Rules).
  sessionNotes: {
    read: { author: true },
    create: {},
    update: {},
    delete: {},
  },
  // Certificates (docs/04 `certificates`, S2; D-39): the office reads them; issuing, revoking and
  // reissuing go through the certificates module, which checks who may (VIEW_POLICY) and audits
  // each act, so no role writes one through the API. Never deleted: a certificate is revoked.
  certificates: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: {},
    delete: {},
  },
  // Privacy requests (docs/04 `data_requests`; docs/05, Privacy): the office prepares them; an
  // owner confirms an erasure (VIEW_POLICY.privacyDecision, src/access/views.ts). The public form adds
  // one through the server. Never deleted: a request's record is the proof it was answered.
  dataRequests: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: {},
  },
  // The breach register (docs/04 `incidents`; docs/08 §3): whoever notices an incident in the
  // office records it; owners and the operator keep each step's time. Never deleted.
  incidents: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: { roles: ['owner', 'operator'] },
    delete: {},
  },
  // Feedback (docs/04 `feedback`, private): written by the server from the feedback form (B8,
  // M6); the operator reads it and marks it read; only an owner deletes one (erasure).
  feedback: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: { roles: ['owner', 'operator'] },
    delete: { roles: ['owner'] },
  },
  // Case studies (docs/04 `case_studies`; docs/05, Proof): the staff who keep content write them;
  // anyone reads a published one; publishing needs the client's approval and an owner, which the
  // collection checks itself. Only an owner deletes one.
  caseStudies: {
    read: { roles: ['owner', 'operator', 'editor'], statusPublished: true },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner'] },
  },

  // ---- Automations and messaging (M6; docs/19-automations-and-messaging-design.md) ----

  // The outbox and log of every message (docs/04 `message_log`, S2; docs/05 Messages → Log): the
  // office and the owners read it. Only the server writes it; staff queue a failed message again
  // through the core's own endpoint, which checks the role and the code first. Finance does not
  // read messages (docs/05), and practitioners see none (counselling stays private, CLAUDE.md #3).
  messages: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: {},
    delete: {},
  },
  // The wording of every automated message (docs/05 Messages → Templates; docs/13 §4): content the
  // office, the editors and the owners keep; only an owner approves one (FIELD_POLICY) or deletes.
  messageTemplates: {
    read: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'operator', 'editor'] },
    update: { roles: ['owner', 'operator', 'editor'] },
    delete: { roles: ['owner'] },
  },
  // Each automation's switch and counters (docs/05: "each automation can be paused"): the office
  // and the owners pause and resume one; the rows and counters are the server's.
  automations: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: { roles: ['owner', 'operator'] },
    delete: {},
  },
  // The newsletter list (docs/04 `subscribers`, S2): signups, confirmations and unsubscribes come
  // from the person through the server; the office and the owners read it; only an owner deletes
  // an entry (an erasure). Editors write the issue and see counts, not addresses.
  subscribers: {
    read: { roles: ['owner', 'operator'] },
    create: {},
    update: {},
    delete: { roles: ['owner'] },
  },
  // The newsletter's issues (docs/13 §4, §5: written and edited by a person): editors and owners
  // write and schedule them; the office reads them.
  newsletterIssues: {
    read: { roles: ['owner', 'operator', 'editor'] },
    create: { roles: ['owner', 'editor'] },
    update: { roles: ['owner', 'editor'] },
    delete: { roles: ['owner', 'editor'] },
  },
  // Addresses nothing is sent to (docs/13 §6, §7): the server adds bounces, complaints and STOPs;
  // the office records a request that came another way; only an owner lifts one.
  suppressions: {
    read: { roles: ['owner', 'operator'] },
    create: { roles: ['owner', 'operator'] },
    update: {},
    delete: { roles: ['owner'] },
  },

  // ---- Customer accounts (Release 2; docs/20-accounts-design.md §8) ----

  // A person's My IIIC account (docs/04 `accounts`, S2 · "the person; owners"): owners read it.
  // Only the server writes one, as the person signs in, adds a detail or closes it; an owner ends
  // an account's sessions through its own endpoint, with the two-factor code (D-125). Customers
  // are never Payload users: what a person reads of their own goes through src/lib/accounts.
  accounts: {
    read: { roles: ['owner'] },
    create: {},
    update: {},
    delete: {},
  },
  // One row per sign-in code asked for (docs/20 §4.8): keyed hashes and times only, for the rate
  // limits and as the subject of the code's message. No one reads them; the server purges them.
  signInRequests: {
    read: {},
    create: {},
    update: {},
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
  // A review's record behind the card (S2, docs/04): who wrote it, where it came from and where
  // the original is kept, the screening, the consent, notes. The staff who moderate reviews; a
  // visitor reads the published card only.
  testimonialRecord: {
    read: { roles: ['owner', 'operator'] },
    write: { roles: ['owner', 'operator'] },
  },
  // What a booking costs, its tax and its payment state in money (CLAUDE.md #5): read by the staff
  // who see prices; written by the server alone, which computes them (no role may type them).
  // A practitioner sees the booking's paid or unpaid state only (docs/05).
  bookingMoney: {
    read: { roles: ['owner', 'operator', 'finance'] },
    write: { roles: [] },
  },
  // Everything on a booking but its state: the office changes it (docs/05). A practitioner reads
  // their own bookings and marks them attended or a no-show, which the collection's hook holds
  // (src/lib/booking/bookingHooks.ts), and changes nothing else: not the client, the time, who it
  // is with, or the manage link (D-89).
  bookingEdits: {
    read: { roles: ['owner', 'operator', 'practitioner'] },
    write: { roles: ['owner', 'operator'] },
  },
  // Server bookkeeping on a booking (its calendar event, when it was confirmed): every staff role
  // that reads the booking reads it; only the server writes it.
  serverOnly: {
    read: { roles: ROLES },
    write: { roles: [] },
  },
  // Everything on a person's record but the name, mobile and email: the office and the owners. A
  // practitioner, who reads their own clients (POLICY.people), reads those three and nothing more
  // (the owner's rule of 22 November 2026). Only the office writes a person at all.
  personRecord: {
    read: { roles: ['owner', 'operator'] },
    write: { roles: ['owner', 'operator'] },
  },
  // The join link of a fixed-time session goes to the people booked on it, never to the page that
  // lists the times; the office keeps it, the practitioner who runs it reads it.
  eventJoinLink: {
    read: { roles: ['owner', 'operator', 'practitioner'] },
    write: { roles: ['owner', 'operator'] },
  },
  // A proposal's fees and their total (docs/17 §5): quoted prices, so an owner sets them
  // (docs/05: the operator cannot change prices); the staff who read proposals read them. The
  // total is the server's sum, written by no role.
  proposalFees: {
    read: { roles: ['owner', 'operator', 'finance'] },
    write: { roles: ['owner'] },
  },
  // A case study's client approval (docs/05, Proof: required before publishing): the staff who
  // keep case studies record it; the public card never shows it.
  caseStudyApproval: {
    read: { roles: ['owner', 'operator', 'editor'] },
    write: { roles: ['owner', 'operator', 'editor'] },
  },
  // A message template's approval (docs/13 §4: every template has an owner and a review date):
  // the staff who keep templates read it; only an owner approves wording or records Meta's
  // decision on a WhatsApp template.
  messageApproval: {
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
    const servesVisitors = Boolean(rule.published || rule.active || rule.statusPublished)
    if (
      rule.roles?.length &&
      hasRole(user, ...rule.roles) &&
      (!servesVisitors || codeEntered(user))
    ) {
      return true
    }
    if (rule.self && user && isActive(user)) return { id: { equals: user.id } }
    if (rule.ownPractitioner && user?.id !== undefined && hasRole(user, 'practitioner')) {
      return { [OWN_PRACTITIONER_PATH]: { equals: user.id } }
    }
    if (rule.ownClients && user?.id !== undefined && hasRole(user, 'practitioner')) {
      return { [OWN_CLIENTS_PATH]: { equals: user.id } }
    }
    // An author's own documents, and only with the code: payload-totp's wrapper would ask for it
    // too, but a rule that guards S3 asks for itself (CLAUDE.md #3).
    if (rule.author && user?.id !== undefined && isActive(user) && codeEntered(user)) {
      return { [OWN_AUTHOR_PATH]: { equals: user.id } }
    }
    if (rule.published) return { _status: { equals: 'published' } }
    if (rule.active) return { active: { equals: true } }
    if (rule.statusPublished) return { status: { equals: 'published' } }
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
