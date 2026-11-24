import Link from 'next/link'
import type { ServerProps } from 'payload'

import { mayOpen } from '@/access/views'

import { CERTIFICATES_COPY as COPY } from './certificatesCopy'
import { ISSUE_PATH } from './CertificatesIssueView'

/**
 * The way to Learning → Certificates → Issue (docs/18 §6), after the admin's own navigation, in
 * the navigation's own markup. Shown only to the staff who may open it.
 */
export function CertificatesNavLink({ payload, user }: ServerProps) {
  if (!mayOpen(user, 'certificatesIssue')) return null
  return (
    <Link
      className="nav__link"
      href={`${payload.config.routes.admin}${ISSUE_PATH}`}
      id="nav-certificates-issue"
    >
      <span className="nav__link-label">{COPY.navLink}</span>
    </Link>
  )
}
