import Image from 'next/image'
import Link from 'next/link'

import logo from '@/brand/logo/iiic-logo.svg'
import { Todo } from '@/components/Todo'

/**
 * Contact details follow D-31: the phone from both 2026 brochures, info@iiicedu.com
 * until the platform domain's addresses exist (I-02), and the address without a PIN
 * until I-33 is answered. The affiliation statement waits on the lawyer (D-20).
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
      { href: '/map', label: 'Find your path' },
    ],
  },
  {
    heading: 'Institute',
    links: [
      { href: '/institute', label: 'Research' },
      { href: '/institute#verify', label: 'Verify a certificate' },
      { href: '/about', label: 'About' },
    ],
  },
] as const

const LEGAL = [
  { href: '/legal', label: 'Legal' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refunds', label: 'Refunds' },
  { href: '/grievance', label: 'Grievance officer' },
] as const

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <>
      <footer className="iiic-footer-grid">
        <div className="iiic-footer-brand">
          <Image src={logo} alt="Indian Institute of Image Catalysts" height={56} unoptimized />
          <p>408, The Claywalls, Hebatpur Road, Thaltej, Ahmedabad, Gujarat</p>
          {/* The kit sets footer links to display: block, so each sits on its own line. */}
          <a href="tel:+919624046464">+91 96240 46464</a>
          <a href="mailto:info@iiicedu.com">info@iiicedu.com</a>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.heading}>
            <h4>{column.heading}</h4>
            {column.links.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </footer>
      <div className="iiic-footer-legal">
        <span>
          © {year} Indian Institute of Image Catalysts ·{' '}
          <Todo
            what="statement that IIIC is privately owned and not affiliated with any Government body"
            id="D-20"
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
    </>
  )
}
