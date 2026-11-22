import Link from 'next/link'
import type { Payload, PayloadRequest, UIFieldServerComponent } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { targetOf } from '@/lib/redirects/table'
import { APP_PAGES } from '@/lib/seo/appPages'

import styles from './CreateRedirect.module.css'
import { CreateRedirectPanel } from './CreateRedirectPanel'
import { REDIRECTS_COPY as COPY } from './redirectsCopy'

type Entry = { path?: string; resolved?: number | string | { id: number | string } | null }

/**
 * The pages a redirect can lead to, offered as the person types: the starter pages, the pages
 * published in the admin and the pages the app draws itself. Any other page's address may be
 * typed too.
 */
async function sitePaths(payload: Payload, req: PayloadRequest): Promise<string[]> {
  const { docs } = await payload.find({
    collection: 'pages',
    where: { _status: { equals: 'published' } },
    limit: 1000,
    pagination: false,
    depth: 0,
    select: { slug: true },
    overrideAccess: false,
    req,
  })
  const slugs = [...Object.keys(STARTER_PAGES), ...docs.map(({ slug }) => slug)]
  const paths = [...slugs.map(pagePath), ...APP_PAGES.map(({ path }) => path)]
  return [...new Set(paths)].sort()
}

/**
 * At the top of a 404 log entry (docs/05, Content → Broken links): "Create redirect", or where
 * the redirect that resolved it leads. Shown to staff who have entered their two-factor code;
 * the form only to those who may make redirects (src/access/policy.ts), and the endpoint checks
 * again (src/lib/redirects/createFromMissing.ts).
 */
export const CreateRedirect: UIFieldServerComponent = async ({ data, id, payload, req }) => {
  const user = req.user
  if (!user || (user as { _strategy?: string })._strategy !== 'totp') return null
  const entry = data as Entry | undefined
  if (id === undefined || !entry?.path) return null

  const resolved = typeof entry.resolved === 'object' ? entry.resolved?.id : entry.resolved
  if (resolved !== undefined && resolved !== null) {
    const redirect = await payload.findByID({
      collection: 'redirects',
      id: resolved,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      req,
    })
    // Where it leads now: a page's address wherever the page lives, or the address given.
    const to = redirect ? await targetOf(redirect.to, payload, req) : null
    return (
      <section className={styles.panel} aria-labelledby="create-redirect-heading">
        <h2 className={styles.heading} id="create-redirect-heading">
          {COPY.resolvedHeading}
        </h2>
        {redirect ? (
          <p className={styles.intro}>
            {to ? (
              <>
                {COPY.resolvedTo} <code>{to}</code>.{' '}
              </>
            ) : (
              <>{COPY.leadsNowhere} </>
            )}
            <Link href={`${payload.config.routes.admin}/collections/redirects/${redirect.id}`}>
              {COPY.openRedirect}
            </Link>
          </p>
        ) : null}
      </section>
    )
  }

  if (!hasRole(user, ...POLICY.redirects.create.roles)) return null
  return (
    <CreateRedirectPanel id={id} path={entry.path} suggestions={await sitePaths(payload, req)} />
  )
}
