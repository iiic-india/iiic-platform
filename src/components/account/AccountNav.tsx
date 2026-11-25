'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import styles from './AccountNav.module.css'
import { NAV_COPY } from './copy'

/** Whether a section link is the page shown: the overview only at /account, the others below. */
export function isCurrent(href: string, pathname: string): boolean {
  if (href === '/account') return pathname === '/account'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * My IIIC's section links (docs/20 §5): Overview · Bookings · Documents · Invoices · Privacy, the
 * page shown marked with `aria-current`. Plain links, so they work without JavaScript; the path is
 * read on the server as on the client.
 */
export function AccountNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label={NAV_COPY.label}>
      <ul className={styles.links}>
        {NAV_COPY.sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              prefetch={false}
              aria-current={isCurrent(section.href, pathname) ? 'page' : undefined}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
