import Link from 'next/link'

import styles from './MainLinks.module.css'

/**
 * The eight main links (docs/11 §5.1, item 7; docs/12 §3, Internal linking), in the order the
 * 404 lists them: the way back for someone whose link broke or whose search found nothing.
 * Contact opens the contact section of /about, as the footer's does.
 */
export const MAIN_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/framework', label: 'Framework' },
  { href: '/organisations', label: 'For organisations' },
  { href: '/learn', label: 'Learn' },
  { href: '/counselling', label: 'Counselling' },
  { href: '/proof', label: 'Proof' },
  { href: '/journal', label: 'Journal' },
  { href: '/about#contact', label: 'Contact' },
] as const

export function MainLinks({ label }: { label: string }) {
  return (
    <nav aria-label={label}>
      <ul className={styles.links}>
        {MAIN_LINKS.map((link) => (
          <li key={link.href}>
            <Link className="iiic-link" href={link.href} prefetch={false}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
