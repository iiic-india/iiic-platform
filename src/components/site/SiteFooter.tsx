import Image from 'next/image'
import Link from 'next/link'

import logo from '@/brand/logo/iiic-logo.svg'
import { Todo } from '@/components/Todo'
import { CONTACT, mailHref, telHref } from '@/lib/site/contact'

import styles from './SiteFooter.module.css'

/**
 * The kit's footer (src/brand/templates/web/page-shell.html) inside one <footer>
 * landmark, so the legal row belongs to it too; the kit styles both parts by class.
 * It carries the eight main links (docs/12 §3, listed in docs/11 §5.1): the logo links
 * home, and Contact opens the contact section of /about. The contact details are the ones
 * that section shows (D-31; src/lib/site/contact.ts).
 * The affiliation statement waits on the lawyer (D-20).
 */
const COLUMNS = [
  {
    heading: 'Learn',
    links: [
      { href: '/framework', label: 'Subjective Self' },
      { href: '/learn', label: 'Certification' },
      { href: '/journal', label: 'Journal' },
    ],
  },
  {
    heading: 'Work with us',
    links: [
      { href: '/organisations', label: 'For organisations' },
      { href: '/counselling', label: 'Counselling' },
      { href: '/proof', label: 'Proof' },
      { href: '/map', label: 'Find your path' },
    ],
  },
  {
    heading: 'Institute',
    links: [
      { href: '/institute', label: 'Research' },
      { href: '/institute/verify', label: 'Verify a certificate' },
      { href: '/about', label: 'About' },
      { href: '/about#contact', label: 'Contact' },
    ],
  },
] as const

const LEGAL = [
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/grievance', label: 'Grievance officer' },
  { href: '/accessibility', label: 'Accessibility' },
] as const

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className={styles.footer}>
      <div className="iiic-footer-grid">
        <div className="iiic-footer-brand">
          <Link className={styles.home} href="/">
            <Image src={logo} alt="Indian Institute of Image Catalysts" height={56} unoptimized />
          </Link>
          {/* The kit sets footer links to display: block, so each sits on its own line. */}
          <address className={styles.contact}>
            <p>{CONTACT.address}</p>
            <a href={telHref(CONTACT.phone)}>{CONTACT.phone}</a>
            <a href={mailHref(CONTACT.email)}>{CONTACT.email}</a>
          </address>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h2 className={styles.title}>{column.heading}</h2>
            {column.links.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="iiic-footer-legal">
        <span>
          © {year} Indian Institute of Image Catalysts ·{' '}
          <Todo
            what="statement that IIIC is privately owned and not affiliated with any Government body"
            id="I-30"
          />
        </span>
        <span>
          {LEGAL.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? ' · ' : null}
              <Link className="iiic-link" href={link.href}>
                {link.label}
              </Link>
            </span>
          ))}
        </span>
      </div>
    </footer>
  )
}
