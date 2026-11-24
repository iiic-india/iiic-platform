import Link from 'next/link'
import type { ServerProps } from 'payload'

import { may } from '@/lib/office/who'

import { OFFICE_VIEW_COPY as COPY } from './officeViewCopy'

/**
 * The way to Calendar → Working hours (src/components/admin/office/WorkingHoursView.tsx), after
 * the admin's own navigation, in its own markup: for the office and practitioners who have
 * entered their two-factor code.
 */
export function WorkingHoursNavLink({ payload, user }: ServerProps) {
  if (!may(user, 'hours')) return null
  return (
    <Link
      className="nav__link"
      href={`${payload.config.routes.admin}/working-hours`}
      id="nav-working-hours"
    >
      <span className="nav__link-label">{COPY.hoursNav}</span>
    </Link>
  )
}
