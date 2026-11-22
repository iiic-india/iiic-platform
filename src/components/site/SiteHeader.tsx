import Image from 'next/image'
import Link from 'next/link'

import mark from '@/brand/logo/iiic-mark.svg'
import { ReadingBar } from '@/components/experience/ReadingBar'

import { NavToggle } from './NavToggle'
import styles from './SiteHeader.module.css'

/** Release 1 navigation (docs/02-routes-and-pages.md). "Log in" arrives in Release 2. */
export const NAV_LINKS = [
  { href: '/framework', label: 'Framework' },
  { href: '/organisations', label: 'For organisations' },
  { href: '/learn', label: 'Learn' },
  { href: '/counselling', label: 'Counselling' },
  { href: '/proof', label: 'Proof' },
] as const

export function SiteHeader() {
  return (
    <header className="iiic-header">
      <Link className="iiic-brand" href="/">
        <Image
          src={mark}
          alt="IIIC: a face in profile carrying the letters iiic"
          width={23}
          height={40}
          unoptimized
          priority
        />
        <span>
          <strong>IIIC</strong>
          <small>Indian Institute of Image Catalysts</small>
        </span>
      </Link>
      <NavToggle controls="site-nav" />
      <nav className="iiic-nav" id="site-nav" aria-label="Main">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
        {/* The header's search on wide screens (docs/11 §5.3): a link to /search, which holds
            the field, so the header costs no script and no room it lacks. Below 1200 px the
            header has no room for it, and the menu stays as it was. */}
        <Link className={styles.search} href="/search" prefetch={false}>
          Search
        </Link>
        <Link className="iiic-btn iiic-btn-primary" href="/map">
          Find your path
        </Link>
      </nav>
      {/* The bar on a narrative page (docs/11 §3.1), on the header's lower rule. */}
      <ReadingBar />
    </header>
  )
}
