import Link from 'next/link'
import type { ServerProps } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'

import { BOARD_COPY as COPY } from './copy'

/**
 * The way to the Pipeline board (docs/05 Pipeline; docs/17 §12 C), after the admin's own
 * navigation, in the navigation's own markup. Shown only to staff who can open the board.
 */
export function PipelineNavLink({ payload, user }: ServerProps) {
  if (!user || (user as { _strategy?: string })._strategy !== 'totp') return null
  if (!hasRole(user, ...POLICY.leads.read.roles)) return null
  return (
    <Link className="nav__link" href={`${payload.config.routes.admin}/pipeline`} id="nav-pipeline">
      <span className="nav__link-label">{COPY.navLabel}</span>
    </Link>
  )
}
