import type { BeforeListTableServerProps } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { starterPagesWaiting } from '@/lib/content/copyStarter'
import { pagePath } from '@/lib/content/slug'

import { StarterPagesPanel } from './StarterPagesPanel'

/**
 * Above the Pages list: the starter pages that are on the site but not in the admin yet, each
 * with a way to copy it in as a draft (src/lib/content/copyStarter.ts, D-54). Shown only to
 * staff who may create pages and have entered their two-factor code, and only while a starter
 * page is still waiting.
 */
export async function StarterPages({ payload, user }: BeforeListTableServerProps) {
  if (!user || (user as { _strategy?: string })._strategy !== 'totp') return null
  if (!hasRole(user, ...POLICY.pages.create.roles)) return null
  const waiting = await starterPagesWaiting(payload)
  if (waiting.length === 0) return null
  return (
    <StarterPagesPanel
      pages={waiting.map(({ slug, title }) => ({ slug, title, path: pagePath(slug) }))}
    />
  )
}
