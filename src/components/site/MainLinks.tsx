import Link from 'next/link'

import { MAIN_LINKS } from '@/lib/site/mainLinks'

import styles from './MainLinks.module.css'

// The links themselves are in src/lib/site/mainLinks.ts; they are passed on from here for the
// files that already read them with the component.
export { MAIN_LINKS }

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
