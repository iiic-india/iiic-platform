import { PRODUCTION_ORIGIN } from '@/lib/seo/site'
import { CONTACT, mailHref } from '@/lib/site/contact'

/**
 * /.well-known/security.txt (RFC 9116; docs/11 §5.5; docs/12 §5, Disclosure): where to report
 * a security problem, in which language, and until when the file holds. The contact is the
 * security address once the platform domain's addresses exist (I-02); until then it is the
 * address the site publishes (src/lib/site/contact.ts, D-31), so the file and the footer never
 * disagree. Nothing else: no policy page, bounty or key exists to point at.
 */

/** Where the file lives (RFC 9116 §3). */
export const SECURITY_TXT_PATH = '/.well-known/security.txt'

const DAY = 24 * 60 * 60 * 1000

/**
 * The file's expiry: 365 days from the start of the day it is served (UTC), so always a little
 * under a year ahead, as RFC 9116 §2.5.5 recommends. The file is generated per request (and
 * kept at the edge for a day at most), so it is renewed every day and never goes stale.
 */
export function expiresAfter(now: Date): Date {
  const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(startOfDay + 365 * DAY)
}

/**
 * The file's text. `Canonical` names the production address (D-05), which RFC 9116 asks to be
 * https, whichever deployment serves the file, as every canonical URL does (docs/12 §3).
 */
export function securityTxt(now: Date = new Date()): string {
  return [
    `Contact: ${mailHref(CONTACT.email)}`,
    `Expires: ${expiresAfter(now).toISOString()}`,
    'Preferred-Languages: en',
    `Canonical: ${PRODUCTION_ORIGIN}${SECURITY_TXT_PATH}`,
    '',
  ].join('\n')
}
