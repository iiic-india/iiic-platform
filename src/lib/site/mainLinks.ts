/**
 * The eight main links (docs/11 §5.1, item 7; docs/12 §3, Internal linking), in the order the
 * 404 lists them: the way back for someone whose link broke or whose search found nothing.
 * Contact opens the contact section of /about, as the footer's does.
 *
 * They live in a file with no imports, so a test that runs outside the app (the end-to-end
 * suite) can read them without loading a component and its stylesheet.
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
