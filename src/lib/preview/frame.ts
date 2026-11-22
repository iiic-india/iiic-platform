import { jwtVerify } from 'jose'

/**
 * Whether a request may be answered with a response the admin can frame (docs/15 §5.3, OS-4):
 * the admin's live preview shows the page in a frame on the same origin, and every other
 * response keeps `frame-ancestors 'none'` and `X-Frame-Options: DENY` (docs/12 §5). The proxy
 * asks this on every page request, before anything renders, so it reads only cookies:
 * - Next.js's draft-mode cookie, which only /api/preview sets, and only for staff who may
 *   preview (src/app/api/preview/route.ts);
 * - the staff session cookie;
 * - payload-totp's two-factor cookie, a token Payload's secret signed when the person entered
 *   their code, which must verify and be unexpired here.
 * It decides framing only. Whether a draft is drawn is decided again by the page itself, which
 * reads the session in full (src/lib/preview/session.ts); a request that passes here and fails
 * there gets the published page, framed or not.
 */

/** Next.js's draft-mode cookie (`draftMode().enable()`). */
export const DRAFT_MODE_COOKIE = '__prerender_bypass'
/** Payload's session cookie and payload-totp's, under Payload's default prefix. */
export const SESSION_COOKIE = 'payload-token'
export const TWO_FACTOR_COOKIE = 'payload-totp'

type CookieReader = { get(name: string): { value: string } | undefined }

/**
 * The key Payload signs its tokens with: the first 32 characters of the SHA-256 of
 * PAYLOAD_SECRET, in hex (Payload's own derivation, `payload.secret`), as bytes.
 */
async function signingKey(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
  return new TextEncoder().encode(hex)
}

/** Whether the two-factor cookie holds a token Payload signed for a user, still in date. */
async function twoFactorVerified(token: string, secret: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, await signingKey(secret), {
      algorithms: ['HS256'],
    })
    return payload.userId !== undefined && payload.userId !== null
  } catch {
    return false
  }
}

/** Whether the response to a request with these cookies may be framed by the admin. */
export async function framedByAdmin(cookies: CookieReader, secret: string): Promise<boolean> {
  const draft = cookies.get(DRAFT_MODE_COOKIE)?.value
  const session = cookies.get(SESSION_COOKIE)?.value
  const twoFactor = cookies.get(TWO_FACTOR_COOKIE)?.value
  if (!draft || !session || !twoFactor) return false
  return twoFactorVerified(twoFactor, secret)
}
