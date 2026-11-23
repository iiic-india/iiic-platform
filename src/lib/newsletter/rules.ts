import { z } from 'zod'

/**
 * The newsletter's rules, as pure functions (docs/19 §8; D-10; docs/13 §6): what a signup does
 * to the list, given what the list already holds. Free of `server-only`, tested without a database.
 */

export type SubscriberStatus = 'pending' | 'confirmed' | 'unsubscribed'

/** A second request within this time sends no second email (a double click, a bored bot). */
export const RESEND_AFTER_MS = 2 * 60 * 1000

/**
 * What a signup does:
 * - `create`: a new pending entry, and the confirmation email (N1);
 * - `renew`: a pending or unsubscribed entry gets a new link (the old one stops working);
 * - `none`: already confirmed, or a link went out moments ago. The visitor sees the same answer
 *   in every case, so the form never tells anyone whether an address is on the list.
 */
export type SignupAction = 'create' | 'renew' | 'none'

export function signupAction(
  existing: { status: SubscriberStatus; confirmExpiresAt?: string | null } | null,
  now: Date,
  confirmDays: number,
): SignupAction {
  if (!existing) return 'create'
  if (existing.status === 'confirmed') return 'none'
  if (existing.status === 'pending' && existing.confirmExpiresAt) {
    const issuedAt = Date.parse(existing.confirmExpiresAt) - confirmDays * 86_400_000
    if (now.getTime() - issuedAt < RESEND_AFTER_MS) return 'none'
  }
  return 'renew'
}

/** Whether a pending entry's link still works. */
export function linkLive(confirmExpiresAt: string | null | undefined, now: Date): boolean {
  if (!confirmExpiresAt) return false
  const at = Date.parse(confirmExpiresAt)
  return Number.isFinite(at) && at > now.getTime()
}

/** The signup form's fields, checked at the boundary (docs/12 §6). `website` is a trap for bots. */
export const SignupInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ message: 'Enter an email address, like name@example.com.' })),
  source: z
    .string()
    .trim()
    .max(100)
    .regex(/^\/[^\s]*$/)
    .optional()
    .catch(undefined),
  website: z.string().max(200).optional(),
})
export type SignupInput = z.infer<typeof SignupInput>

/** The one-click unsubscribe body RFC 8058 requires. */
export const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click'

/** Whether a POST's fields are RFC 8058's one-click body (and not a page's form). */
export function isOneClick(fields: Record<string, unknown> | null | undefined): boolean {
  return fields?.['List-Unsubscribe'] === 'One-Click'
}

/**
 * A signed link's token as the core makes it (src/lib/messaging/operations.ts `SignLink`: a JWS
 * in compact form), checked for shape before it is verified.
 */
export const SignedLinkToken = z
  .string()
  .min(16)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*){0,4}$/)

/** The site paths the newsletter's links point to (the core builds its footer links with them). */
export const NEWSLETTER_PATHS = {
  signup: '/api/newsletter',
  confirm: (token: string) => `/newsletter/confirm/${token}`,
  unsubscribePage: (token: string) => `/newsletter/unsubscribe/${token}`,
  oneClick: (token: string) => `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
  withdraw: (token: string) => `/w/${token}`,
} as const
