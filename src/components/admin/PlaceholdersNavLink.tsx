import Link from 'next/link'
import type { ServerProps } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'

import { PLACEHOLDERS_COPY as COPY } from './placeholdersCopy'

/**
 * The way to the placeholders report, after the admin's own navigation (docs/05, Content;
 * D-56), in the navigation's own markup. Shown only to staff who can open the report.
 */
export function PlaceholdersNavLink({ payload, user }: ServerProps) {
  if (!user || (user as { _strategy?: string })._strategy !== 'totp') return null
  if (!hasRole(user, ...POLICY.pages.read.roles)) return null
  return (
    <Link
      className="nav__link"
      href={`${payload.config.routes.admin}/placeholders`}
      id="nav-placeholders"
    >
      <span className="nav__link-label">{COPY.title}</span>
    </Link>
  )
}
