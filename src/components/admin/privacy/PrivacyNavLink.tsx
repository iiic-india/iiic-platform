import Link from 'next/link'
import type { ServerProps } from 'payload'

import { mayOpen } from '@/access/views'

import { PRIVACY_COPY as COPY } from './privacyCopy'

/**
 * The way to the Privacy view, after the admin's own navigation (docs/05, Privacy), in the
 * navigation's own markup. Shown only to staff who may open it.
 */
export function PrivacyNavLink({ payload, user }: ServerProps) {
  if (!mayOpen(user, 'privacy')) return null
  return (
    <Link className="nav__link" href={`${payload.config.routes.admin}/privacy`} id="nav-privacy">
      <span className="nav__link-label">{COPY.navLabel}</span>
    </Link>
  )
}
