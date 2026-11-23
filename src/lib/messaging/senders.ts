import type { SenderKey } from './types'

/**
 * Who a message is from and where a reply goes (docs/13 §1, §3): transactional mail from the
 * `notify.` subdomain, the newsletter from `news.`, replies to the role inboxes on the root
 * domain (Google Groups), internal alerts with no reply address. The domain is `MAIL_DOMAIN`
 * (`imagecatalysts.in`, D-05); without it (development, CI) every message goes from the one
 * address in `EMAIL_FROM_ADDRESS` with no reply address, as the staff reset email does (D-47).
 */

type Identity = { name: string; local: string; subdomain: 'notify' | 'news'; replyTo?: string }

export const SENDERS: Readonly<Record<SenderKey, Identity>> = {
  bookings: { name: 'IIIC Bookings', local: 'bookings', subdomain: 'notify', replyTo: 'bookings' },
  hello: { name: 'IIIC', local: 'hello', subdomain: 'notify', replyTo: 'hello' },
  // Internal alerts, digests and reports: replies are discarded (docs/13 §3).
  platform: { name: 'IIIC Platform', local: 'platform', subdomain: 'notify' },
  journal: { name: 'IIIC Journal', local: 'journal', subdomain: 'news', replyTo: 'hello' },
}

export type SenderAddresses = { from: string; replyTo?: string; sendingDomain: string }

/** The From and Reply-To of a sender, for a mail domain, or the fallback address without one. */
export function senderFor(
  key: SenderKey,
  mailDomain: string | undefined,
  fallbackAddress: string,
): SenderAddresses {
  const identity = SENDERS[key]
  if (!mailDomain) {
    const domain = fallbackAddress.split('@')[1] ?? ''
    return { from: `${identity.name} <${fallbackAddress}>`, sendingDomain: domain }
  }
  const sendingDomain = `${identity.subdomain}.${mailDomain}`
  return {
    from: `${identity.name} <${identity.local}@${sendingDomain}>`,
    ...(identity.replyTo ? { replyTo: `${identity.replyTo}@${mailDomain}` } : {}),
    sendingDomain,
  }
}
