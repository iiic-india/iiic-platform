import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The first account on a database becomes the owner (src/collections/Users.ts). On any
 * production server (Vercel's production, or `next start` anywhere else) that account can
 * only be created after opening the owner setup link,
 * /api/owner-setup?token=<OWNER_SETUP_TOKEN> (D-41), so whoever reaches an empty
 * production /admin first cannot claim the platform. Previews sit behind Vercel
 * Authentication and hold test data only; `pnpm dev` and the tests run on the
 * developer's machine or in CI. None of those needs the link.
 */
export const OWNER_SETUP_COOKIE = 'iiic-owner-setup'
/** The only request that reads the cookie: Payload's first-user registration. */
export const OWNER_SETUP_COOKIE_PATH = '/api/users/first-register'
export const OWNER_SETUP_MAX_AGE_SECONDS = 10 * 60

const digest = (value: string) => createHash('sha256').update(value).digest()

/** Constant-time comparison; false when either side is missing or empty. */
export function tokenMatches(expected: string | undefined, presented: string | undefined): boolean {
  if (!expected || !presented) return false
  return timingSafeEqual(digest(expected), digest(presented))
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    const raw = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}

export type FirstOwnerRequest = {
  vercelEnv: string | undefined
  nodeEnv: string | undefined
  expectedToken: string | undefined
  cookieHeader: string | null | undefined
}

/**
 * Whether this request may create the first account, which becomes the owner. Fails
 * closed: a production server always needs the setup cookie. Nothing the request says
 * about itself stands in for it; Payload marks its admin's server functions as Local API
 * calls too, so `req.payloadAPI` cannot tell server code from a browser.
 */
export function mayCreateFirstOwner(request: FirstOwnerRequest): boolean {
  if (request.vercelEnv === 'preview' || request.vercelEnv === 'development') return true
  const production = request.vercelEnv === 'production' || request.nodeEnv === 'production'
  if (!production) return true
  return tokenMatches(request.expectedToken, readCookie(request.cookieHeader, OWNER_SETUP_COOKIE))
}
