import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { Result } from '@/lib/result'

/**
 * The contract of customer accounts and My IIIC (Release 2, item 2; docs/20-accounts-design.md).
 * Types, constants and input schemas only: three builders implement it in parallel (docs/20 §13),
 * A the sign-in and the sessions, B My IIIC's records, C privacy and the account's settings, and
 * none of them changes this file without the lead. Pure, free of `server-only`: the collections
 * and the tests read the constants.
 *
 * Customers are not staff. They never become Payload's `req.user`; Payload's access rules stay
 * the staff's. A customer's reads and writes go through the server functions below, which take
 * the signed-in `AccountSession` and touch only that account's records (docs/20 §8).
 */

// ---- Sign-in: the numbers (docs/03 F7; docs/08 §9; D-08; docs/20 §4) ----

/** How a person signs in: an emailed code, or a WhatsApp code once the provider is set up (D-08). */
export const SIGN_IN_CHANNELS = ['email', 'whatsapp'] as const
export type SignInChannel = (typeof SIGN_IN_CHANNELS)[number]

export const SIGN_IN = {
  /** Six digits (D-08). */
  codeLength: 6,
  /** A code works for ten minutes (docs/03 F7). */
  codeTtlSeconds: 10 * 60,
  /** Five tries per code; the fifth wrong one ends it (docs/03 F7; docs/08 §9). */
  attemptsPerCode: 5,
  /** A session on a device the person chose to keep: thirty days from sign-in (docs/03 F7). */
  trustedSessionDays: 30,
  /** Any other session: until the browser closes, and a day at most on the server (D-115). */
  untrustedSessionHours: 24,
  /** "Send a new code" waits this long after the last one (D-116). */
  resendAfterSeconds: 60,
  /** Closing an account, an access or an erasure request: signed in within this long (D-121). */
  recentSignInMinutes: 10,
} as const

/**
 * Code requests (docs/03 F7: "rate-limited per number and per IP"; docs/12 §5), counted from the
 * `sign-in-requests` rows (D-116): per address typed, at most one a minute, five an hour and ten
 * a day; per network address, twenty an hour; across the site, 120 in ten minutes. The same
 * answer comes whether or not the address has an account (docs/20 §4.4).
 */
export const SIGN_IN_LIMITS = {
  perIdentifier: [
    { count: 1, windowMs: 60 * 1000 },
    { count: 5, windowMs: 60 * 60 * 1000 },
    { count: 10, windowMs: 24 * 60 * 60 * 1000 },
  ],
  perNetwork: [{ count: 20, windowMs: 60 * 60 * 1000 }],
  /**
   * Across the site, as the newsletter's signup counts its pending entries (A6): a burst from
   * many network addresses cannot make the platform mail strangers in bulk. Past it, `/login`
   * says it is busy; it names no address.
   */
  site: [{ count: 120, windowMs: 10 * 60 * 1000 }],
} as const

/** A `sign-in-requests` row is kept this long, then purged (docs/20 §4.8; O5). */
export const SIGN_IN_REQUEST_KEEP_HOURS = 48

// ---- Cookies (docs/12 §10; docs/20 §10) ----

/**
 * Carries one sign-in from the address step to the code step and, for a new account, to the
 * account step: a JWE (dir, A256GCM) under a key derived from BETTER_AUTH_SECRET for this alone,
 * holding the channel, the address, the `sign-in-requests` id, when the code went and, once a
 * right code has been used for an address with no account, that the address was proven and
 * when. Never the code. HttpOnly, Secure over HTTPS, SameSite=Lax, path /login, fifteen minutes;
 * cleared on sign-in and by "Use a different address".
 */
export const SIGN_IN_COOKIE = {
  name: 'iiic-sign-in',
  path: '/login',
  maxAgeSeconds: 15 * 60,
} as const

/**
 * A second detail's attempt (docs/20 §4.6), the same sealed value as the sign-in cookie's, under
 * a name of its own and sent only to /account, where a signed-in person asks for the code and
 * enters it (`/account/privacy/contact`): it never reaches /login, so an unconfirmed detail code
 * cannot stand in for a sign-in's (D-129). HttpOnly, Secure over HTTPS, SameSite=Lax, fifteen
 * minutes; cleared when the code is confirmed.
 */
export const ADD_DETAIL_COOKIE = {
  name: 'iiic-add-detail',
  path: '/account',
  maxAgeSeconds: 15 * 60,
} as const

/**
 * Better Auth's cookies take this prefix (`advanced.cookiePrefix`): `iiic-account.session_token`
 * and, for a device the person did not keep, `iiic-account.dont_remember`; over HTTPS each name
 * starts with `__Secure-` (`advanced.useSecureCookies`).
 */
export const SESSION_COOKIE_PREFIX = 'iiic-account'

// ---- Better Auth's tables (docs/20 §3.2) ----

/**
 * Better Auth keeps its own four tables in a Postgres schema of their own, never Supabase's
 * `auth`. They are created by a hand-written migration after `r2a_accounts` (docs/20 §3.3), and
 * a unit test holds that migration to Better Auth's own description of its tables.
 */
export const CUSTOMER_AUTH = {
  schema: 'customer_auth',
  tables: {
    user: 'users',
    session: 'sessions',
    account: 'identities',
    verification: 'verifications',
  },
} as const

// ---- The signed-in customer (builder A) ----

export type AccountSession = {
  /** The `accounts` row. */
  accountId: number
  /** The account's own `people` record, which holds its verified details (docs/04). */
  personId: number
  /** Better Auth's user id (`customer_auth.users.id`). */
  authUserId: string
  /** Better Auth's session id, for "this device" in the devices list. */
  sessionId: string
  /** When this session began (the code was entered), for the recent-sign-in rule. */
  signedInAt: Date
  expiresAt: Date
  /** The person kept this device signed in (thirty days). */
  trustedDevice: boolean
  /** The details this account has verified with a code. Server-side only; never logged. */
  verified: { email: string | null; mobile: string | null }
}

/**
 * The session of this request, or null: no cookie, an expired or revoked session, an account that
 * is gone, accounts switched off (`accountsEnabled`), or a deployment that is not production,
 * local or CI (previews share production's database: docs/20 §4.9). Cached for the request.
 */
export type GetAccountSession = () => Promise<AccountSession | null>

/**
 * The session, or a redirect to `/login` (with `next` when it is a path under `/account`). Every
 * page and action under `/account` calls it before it reads anything (CLAUDE.md #6). With
 * `recentMinutes`, a session older than that sends the person to sign in again first.
 */
export type RequireAccount = (options?: {
  next?: string
  recentMinutes?: number
}) => Promise<AccountSession>

// ---- Sign-in steps (builder A; docs/20 §4) ----

/** What the address step sends. The address is typed as the person types it. */
export const codeRequestInput = z.strictObject({
  channel: z.enum(SIGN_IN_CHANNELS),
  identifier: z.string().trim().min(3).max(254),
  turnstileToken: z.string().max(2048).optional(),
})
export type CodeRequestInput = z.infer<typeof codeRequestInput>

/**
 * The address step's answer, the same for an address with an account, without one, suppressed
 * or unknown to every provider (no enumeration): the masked address and when "Send a new code"
 * opens. `whatsapp-closed` and `too-many` depend only on the time and on what was typed here.
 */
export type CodeRequestOutcome = { masked: string; resendAt: Date }

export type CodeRequestError =
  /** A preview deployment, accounts switched off, or Better Auth's secret not set here. */
  | { code: 'closed-here' }
  | { code: 'invalid-identifier' }
  /** WhatsApp not set up here, its authentication template not approved, or quiet hours. */
  | { code: 'whatsapp-closed'; emailInstead: true }
  /** Turnstile's check failed or was not answered. */
  | { code: 'check-failed' }
  | { code: 'too-many'; retryAt: Date }
  /** The site-wide limit: many codes asked for in the last ten minutes, from anyone. */
  | { code: 'busy' }

export type RequestCode = (
  req: PayloadRequest,
  input: CodeRequestInput,
  now: Date,
) => Promise<Result<CodeRequestOutcome, CodeRequestError>>

export const verifyCodeInput = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  trustDevice: z.boolean(),
})
export type VerifyCodeInput = z.infer<typeof verifyCodeInput>

/**
 * A right code for an address that has an account signs in (and attaches any earlier records,
 * docs/20 §6); for one that has none, the account step comes next, with the name on the most
 * recent earlier record (if any) offered for the form. Only someone who has just proved the
 * address learns which it was.
 */
export type VerifyCodeOutcome =
  | { state: 'signed-in'; accountId: number; attached: number }
  | { state: 'needs-account'; suggestedName: string | null }

export type VerifyCodeError =
  | { code: 'closed-here' }
  /** No sign-in in progress in this browser (no cookie, or it ran out). */
  | { code: 'no-request' }
  | { code: 'wrong-code'; triesLeft: number }
  | { code: 'expired' }
  | { code: 'too-many-tries' }

export type VerifyCode = (
  req: PayloadRequest,
  input: VerifyCodeInput,
  now: Date,
) => Promise<Result<VerifyCodeOutcome, VerifyCodeError>>

/**
 * The account step (a new account only): the name, the account consent under the notice in
 * force (an unticked box, D-113), and "I am 18 or older" (D-114). The consent is recorded first,
 * then the person, the account and the session (CLAUDE.md #4).
 */
export const createAccountInput = z.strictObject({
  fullName: z.string().trim().min(1).max(200),
  consent: z.literal(true),
  noticeVersionId: z.number().int().positive(),
  adult: z.literal(true),
  trustDevice: z.boolean(),
})
export type CreateAccountInput = z.infer<typeof createAccountInput>

export type CreateAccountError =
  | { code: 'closed-here' }
  | { code: 'no-request' }
  | { code: 'expired' }
  | { code: 'invalid-input'; fields: string[] }
  /** No account notice in force: the step shows its placeholder and refuses (I-65). */
  | { code: 'notice-missing' }
  /** The notice shown is no longer the one in force: the step is drawn again. */
  | { code: 'notice-changed' }
  /** An earlier record of this address says under 18 (D-114). */
  | { code: 'not-for-under-18' }

export type CreateAccount = (
  req: PayloadRequest,
  input: CreateAccountInput,
  now: Date,
) => Promise<Result<{ accountId: number; attached: number }, CreateAccountError>>

// ---- Sessions and devices (builder A; docs/20 §4.7) ----

export type DeviceSession = {
  id: string
  current: boolean
  signedInAt: Date
  expiresAt: Date
  trustedDevice: boolean
  /** "Chrome on Android" from the user agent, never the address it came from. */
  device: string | null
}

export type ListDevices = (account: AccountSession) => Promise<DeviceSession[]>
/** Ends this session and clears its cookies. */
export type SignOut = () => Promise<void>
/** Ends every session of the account but this one; returns how many ended. Audited. */
export type SignOutEverywhere = (req: PayloadRequest, account: AccountSession) => Promise<number>

// ---- The account's life (builder A; docs/20 §6, §7.6) ----

/**
 * Attaches the earlier records that hold a detail the account has verified (docs/03 F7): every
 * `people` record with that email or mobile that no account holds yet, unless it says under 18.
 * Records are linked, never merged or rewritten; one entry `attach-records` names how many.
 */
export type AttachEarlierRecords = (
  req: PayloadRequest,
  input: { accountId: number; channel: SignInChannel; value: string },
) => Promise<{ attached: number[] }>

export type CloseReason = 'person' | 'erasure' | 'staff'

/**
 * Closes an account: its Better Auth user, sessions and verifications go, its records are
 * detached (they stay the office's, under their own retention), the account consent is
 * withdrawn, the row is deleted, `close-account` is audited and, when the person closed it, A2
 * confirms by email. Nothing else of the person's is deleted: that is an erasure (docs/03 F11).
 */
export type CloseAccount = (
  req: PayloadRequest,
  input: { accountId: number; reason: CloseReason },
) => Promise<Result<{ closed: true }, { code: 'not-found' }>>

/**
 * For the erasure an owner confirms (src/lib/privacy/erasure.ts `confirmErasureWith`, hook H7 in
 * docs/20 §12), in the erasure's transaction: closes the account whose own record is being
 * erased (as `CloseAccount` with reason `erasure`, no A2), and detaches the record from any other
 * account it is attached to. Returns how many of each.
 */
export type CloseAccountsOfPerson = (
  req: PayloadRequest,
  personId: number,
) => Promise<{ closed: number; detached: number }>

/**
 * The nightly O5 (src/lib/automations/operations/run.ts `runO5`, hook H9): `sign-in-requests`
 * older than SIGN_IN_REQUEST_KEEP_HOURS, and Better Auth's expired sessions and codes. Returns
 * how many of each went.
 */
export type PurgeSignIns = (
  req: PayloadRequest,
  now: Date,
) => Promise<{ requests: number; sessions: number; codes: number }>

/**
 * The owner's acts on an account from the admin (`VIEW_POLICY.accountActions`, checked first;
 * D-125): ending all its sessions, and detaching an earlier record the person says is not
 * theirs (D-120). The account's own record cannot be detached; closing does that. Audited as
 * `end-account-sessions` and `detach-record`.
 */
export type EndAccountSessions = (
  req: PayloadRequest,
  accountId: number,
) => Promise<Result<{ ended: number }, { code: 'refused' | 'not-found' }>>

export type DetachRecord = (
  req: PayloadRequest,
  personId: number,
) => Promise<Result<{ detached: true }, { code: 'refused' | 'not-found' | 'own-record' }>>

// ---- A second detail (builder A's machinery, builder C's page; docs/20 §4.6) ----

export const detailRequestInput = z.strictObject({
  channel: z.enum(SIGN_IN_CHANNELS),
  identifier: z.string().trim().min(3).max(254),
})
export type DetailRequestInput = z.infer<typeof detailRequestInput>

export type RequestDetailCode = (
  req: PayloadRequest,
  account: AccountSession,
  input: DetailRequestInput,
  now: Date,
) => Promise<Result<CodeRequestOutcome, CodeRequestError | { code: 'already-yours' }>>

/** A right code adds the detail and attaches its records; A3 tells the detail held before. */
export type ConfirmDetail = (
  req: PayloadRequest,
  account: AccountSession,
  input: { code: string },
  now: Date,
) => Promise<
  Result<
    { attached: number },
    VerifyCodeError | { code: 'belongs-to-another-account' } | { code: 'no-request' }
  >
>

// ---- My IIIC's records (builder B; docs/20 §7) ----

/** The `people` records this account holds: its own and those attached. */
export type OwnPersonIds = (req: PayloadRequest, account: AccountSession) => Promise<number[]>

export type AccountBooking = {
  id: number
  reference: string
  serviceName: string
  /** The register of the booking's service: its page and messages follow it. */
  register: 'counselling' | 'consultancy' | 'education' | 'default'
  startsAt: Date | null
  endsAt: Date | null
  status: string
  format: 'online' | 'office' | null
  /** The meeting link or the office address, as the confirmation gives it. */
  place: string | null
  practitionerName: string | null
  canReschedule: boolean
  canCancel: boolean
}

export type ListOwnBookings = (
  req: PayloadRequest,
  account: AccountSession,
  when: 'upcoming' | 'past',
  now: Date,
) => Promise<AccountBooking[]>

export type GetOwnBooking = (
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
  now: Date,
) => Promise<AccountBooking | null>

export type ManageOwnBookingInput =
  | { kind: 'reschedule'; reference: string; startsAt: string }
  | { kind: 'cancel'; reference: string; reason?: string }

export type ManageOwnBookingError =
  | { code: 'closed-here' }
  | { code: 'not-found' }
  | { code: 'invalid-input' }
  | { code: 'outside-policy' }
  | { code: 'slot-taken' }

export type ManageOwnBooking = (
  req: PayloadRequest,
  account: AccountSession,
  input: ManageOwnBookingInput,
  now: Date,
) => Promise<Result<AccountBooking, ManageOwnBookingError>>

export type AccountCertificate = {
  id: number
  certificateId: string
  programmeName: string
  completedOn: string
  status: 'valid' | 'revoked'
  /** A valid certificate whose PDF is in the private bucket. */
  downloadable: boolean
}

export type AccountInvoice = {
  id: number
  number: string | null
  kind: string
  issuedOn: Date | null
  status: string
  /** Only while `prices_public` is on (D-21, D-101); null otherwise. */
  totalPaise: number | null
  /** Only while `prices_public` is on (D-118). */
  downloadable: boolean
}

export type ListOwnCertificates = (
  req: PayloadRequest,
  account: AccountSession,
) => Promise<AccountCertificate[]>

export type ListOwnInvoices = (
  req: PayloadRequest,
  account: AccountSession,
) => Promise<AccountInvoice[]>

export type OwnDocumentError =
  | { code: 'not-found' }
  | { code: 'not-available' }
  | { code: 'prices-hidden' }
  | { code: 'storage-missing' }

/**
 * A PDF of the account's own from the private bucket, read only after the session and the
 * record's owner are checked, with `download-certificate` or `download-invoice` written to the
 * audit log (actor `account:<id>`) before the file is handed back.
 */
export type DownloadOwnDocument = (
  req: PayloadRequest,
  account: AccountSession,
  input: { kind: 'certificate' | 'invoice'; id: number },
) => Promise<Result<{ pdf: Uint8Array; filename: string }, OwnDocumentError>>

// ---- Privacy and the account's settings (builder C; docs/20 §7.5) ----

/** Purposes a person may give from My IIIC; every purpose in force may be withdrawn (D-119). */
export const GIVABLE_PURPOSES = ['marketingEmail', 'marketingWhatsapp'] as const
export type GivablePurpose = (typeof GIVABLE_PURPOSES)[number]

export type AccountConsentRow = {
  purpose: string
  state: 'granted' | 'withdrawn' | 'none'
  changedAt: Date | null
  canGive: boolean
  canWithdraw: boolean
  /** The notice in force for giving it, when it may be given. */
  noticeVersionId: number | null
}

export type ListOwnConsents = (
  req: PayloadRequest,
  account: AccountSession,
) => Promise<AccountConsentRow[]>

export const giveConsentInput = z.strictObject({
  purpose: z.enum(GIVABLE_PURPOSES),
  noticeVersionId: z.number().int().positive(),
  consent: z.literal(true),
})
export type GiveConsentInput = z.infer<typeof giveConsentInput>

export type GiveConsent = (
  req: PayloadRequest,
  account: AccountSession,
  input: GiveConsentInput,
  now: Date,
) => Promise<
  Result<{ consentId: number }, { code: 'closed-here' | 'notice-changed' | 'already-given' }>
>

export type WithdrawConsent = (
  req: PayloadRequest,
  account: AccountSession,
  input: { purpose: string },
  now: Date,
) => Promise<Result<{ withdrawn: number }, { code: 'closed-here' | 'none-in-force' }>>

/** The requests My IIIC takes (docs/03 F11); withdrawal is the consents list itself. */
export const OWN_REQUEST_TYPES = [
  'access',
  'correction',
  'erasure',
  'nomination',
  'privacyGrievance',
  'consumerComplaint',
] as const
export type OwnRequestType = (typeof OWN_REQUEST_TYPES)[number]

export const ownRequestInput = z.strictObject({
  type: z.enum(OWN_REQUEST_TYPES),
  summary: z.string().trim().min(1).max(4000),
})
export type OwnRequestInput = z.infer<typeof ownRequestInput>

export type CreateOwnRequest = (
  req: PayloadRequest,
  account: AccountSession,
  input: OwnRequestInput,
  now: Date,
) => Promise<
  Result<
    { requestId: number; acknowledgeBy: Date; resolveBy: Date },
    { code: 'closed-here' | 'invalid-input' | 'open-request-exists' | 'sign-in-again' }
  >
>

export type OwnRequestRow = {
  id: number
  type: OwnRequestType | 'withdrawal'
  receivedAt: Date
  status: string
  resolveBy: Date | null
}

export type ListOwnRequests = (
  req: PayloadRequest,
  account: AccountSession,
) => Promise<OwnRequestRow[]>

// ---- The audit log's words for a customer's acts (docs/20 §8) ----

/** A customer's audit entries name the account, never an address: `account:<id>`. */
export type AccountActor = { id: `account:${number}` }

export const ACCOUNT_AUDIT_ACTIONS = [
  'create-account',
  'sign-in',
  'sign-out-everywhere',
  'attach-records',
  'add-contact-detail',
  'close-account',
  'end-account-sessions',
  'detach-record',
  'download-certificate',
  'download-invoice',
] as const
export type AccountAuditAction = (typeof ACCOUNT_AUDIT_ACTIONS)[number]
