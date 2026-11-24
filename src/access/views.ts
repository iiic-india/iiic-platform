import { hasRole, isActive, type MaybeStaff, type Role } from './roles'

/**
 * Who may open each custom admin view and call each of its server functions (docs/05; docs/18 §6;
 * CLAUDE.md #6). Payload's custom views and endpoints are public unless they check for themselves,
 * and payload-totp's wrapper covers collection access only, so every view and every server
 * function of M5 asks `viewRefusal` first, before it reads any input, and answers its refusal.
 * What a view then shows is narrowed again by the collections' own rules (src/access/policy.ts):
 * a practitioner who may open Today sees their own bookings only.
 */
export const VIEW_POLICY = {
  // The operator's morning screen; practitioners see their own version (docs/05, Today).
  today: ['owner', 'operator', 'practitioner'],
  // Week and day across practitioners; a practitioner sees their own (docs/05, Calendar).
  calendar: ['owner', 'operator', 'practitioner'],
  // Moving a booking from the calendar: the office (docs/05, "A client asks to move a session").
  reschedule: ['owner', 'operator'],
  // The plan's figures with their working (docs/05, Reports; docs/15: owners read them weekly).
  reports: ['owner'],
  // Global search: what each role may read, never notes or Map answers (docs/05, D-78 rules).
  search: ['owner', 'operator', 'practitioner', 'finance'],
  // The person record and its timeline; a practitioner sees their own clients (docs/05, People).
  person: ['owner', 'operator', 'practitioner'],
  // Proof moderation: feedback, reviews, case studies (docs/05, Proof).
  proof: ['owner', 'operator'],
  // Privacy: requests, the consent log, the breach register (docs/05, Privacy).
  privacy: ['owner', 'operator'],
  // Confirming an erasure, and the export an access request produces (docs/05, docs/08 §9).
  privacyDecision: ['owner'],
  // Settings screens: organisation, integrations, flags, the audit log (docs/05, Settings).
  settings: ['owner'],
  // A practitioner's own session notes (D-11): writing and reading need the practitioner role,
  // and each note is its author's alone (POLICY.sessionNotes).
  notes: ['practitioner'],
  // Issuing certificates, singly or in bulk, with a preview (D-39).
  certificatesIssue: ['owner', 'operator'],
  // Revoking or reissuing one: a destructive act with a reason (docs/05, principle 4).
  certificatesRevoke: ['owner'],
  // A client's invoice or credit-note PDF from the private bucket, audited (D-88, M7): the roles
  // that read invoices (POLICY.invoices).
  invoicePdf: ['owner', 'finance'],
} as const satisfies Record<string, readonly Role[]>

export type AdminView = keyof typeof VIEW_POLICY

export type ViewRefusal = {
  status: 401 | 403
  /** `sign-in`: no staff session; `enter-code`: signed in without the two-factor code. */
  code: 'sign-in' | 'enter-code' | 'not-allowed'
}

type StaffSession = MaybeStaff & { collection?: string; _strategy?: string }

/**
 * Why a request may not open a view or call its server function, or null when it may: a staff
 * session first, then an active account, then the two-factor code, then the role.
 */
export function viewRefusal(user: unknown, view: AdminView): ViewRefusal | null {
  const staff = user as StaffSession | null | undefined
  if (!staff || staff.collection !== 'users') return { status: 401, code: 'sign-in' }
  if (!isActive(staff)) return { status: 403, code: 'not-allowed' }
  if (staff._strategy !== 'totp') return { status: 403, code: 'enter-code' }
  if (!hasRole(staff, ...VIEW_POLICY[view])) return { status: 403, code: 'not-allowed' }
  return null
}

/** Whether a request may open a view or call its server function. */
export const mayOpen = (user: unknown, view: AdminView): boolean => viewRefusal(user, view) === null
