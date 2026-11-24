import Link from 'next/link'
import type { ServerProps } from 'payload'

import { mayOpen, type AdminView } from '@/access/views'

import { SearchShortcut } from './SearchShortcut'
import { VIEWS_COPY } from './viewsCopy'

const LINKS: { view: AdminView; path: string; label: string }[] = [
  { view: 'today', path: '/today', label: VIEWS_COPY.nav.today },
  { view: 'calendar', path: '/calendar', label: VIEWS_COPY.nav.calendar },
  { view: 'search', path: '/search', label: VIEWS_COPY.nav.search },
  { view: 'proof', path: '/proof', label: VIEWS_COPY.nav.proof },
  { view: 'reports', path: '/reports', label: VIEWS_COPY.nav.reports },
  { view: 'settings', path: '/settings', label: VIEWS_COPY.nav.settings },
]

/**
 * The ways to M5's views, after the admin's own navigation, in the navigation's own markup. Each
 * link shows only to staff who may open its view (VIEW_POLICY), and each view checks again. The
 * search shortcut (`/`, Ctrl K) comes with the search link.
 */
export function ViewsNavLinks({ payload, user }: ServerProps) {
  const admin = payload.config.routes.admin
  const shown = LINKS.filter((link) => mayOpen(user, link.view))
  if (shown.length === 0) return null
  return (
    <>
      {shown.map((link) => (
        <Link
          className="nav__link"
          href={`${admin}${link.path}`}
          id={`nav-${link.view}`}
          key={link.view}
        >
          <span className="nav__link-label">{link.label}</span>
        </Link>
      ))}
      {mayOpen(user, 'search') ? <SearchShortcut href={`${admin}/search`} /> : null}
    </>
  )
}

/**
 * The dashboard's first block (docs/18 §8: Today replaces the dashboard once the interface pass
 * comes; until then a link). Shown only to staff who may open Today.
 */
export function TodayLink({ payload, user }: ServerProps) {
  if (!mayOpen(user, 'today')) return null
  return (
    <section aria-labelledby="dashboard-today" style={{ marginBottom: 24 }}>
      <h2 id="dashboard-today">{VIEWS_COPY.today.title}</h2>
      <p>{VIEWS_COPY.today.dashboardIntro}</p>
      <Link
        className="btn btn--style-primary btn--size-medium"
        href={`${payload.config.routes.admin}/today`}
      >
        {VIEWS_COPY.today.dashboardLink}
      </Link>
    </section>
  )
}
