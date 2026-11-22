import { PRODUCTION_ORIGIN } from '../seo/site'

/**
 * IIIC's old site, iiicedu.com, sends every address to the platform (D-A; docs/02, Redirects;
 * docs/12 §3), page by page where the old page has a successor, by the map in
 * docs/content/sources/old-site-iiicedu-com.md, and to the home page for everything else, all
 * with a 301. The rules match on the host, so they change nothing until that domain points at
 * this deployment; on that day they work as they are. They live in next.config.ts, which this
 * module is read by at build time, so it imports nothing beyond the site's own constants.
 *
 * Next.js removes a trailing slash before any of these rules runs, and every old address ends
 * in one, so a visitor goes from /about-2/ to /about-2 on iiicedu.com first, then to the
 * platform: two steps, both permanent, which search engines follow.
 */

/** The old site's host, with or without www. (Next.js anchors the pattern at both ends.) */
export const OLD_SITE_HOST = String.raw`(?:www\.)?iiicedu\.com`

/** The old site's pages and where each one's successor lives, as the map gives them. */
export const OLD_SITE_MAP = [
  { from: '/about-2', to: '/about' },
  { from: '/individual-excellence', to: '/counselling' },
  { from: '/business-growth', to: '/organisations' },
  { from: '/page-team', to: '/about' },
  { from: '/contact-2', to: '/about' },
  { from: '/event/subjective-self-2-days-workshop-on-self-knowledge', to: '/proof' },
  { from: '/event/subjective-self', to: '/proof' },
  // The theme's own sections, which the map sends home.
  { from: '/ova_sev/:path*', to: '/' },
  { from: '/ova_por/:path*', to: '/' },
  { from: '/ova_dep/:path*', to: '/' },
] as const

export type HostRedirect = {
  source: string
  has: { type: 'host'; value: string }[]
  destination: string
  statusCode: 301
}

/** The rules for next.config.ts's redirects(): the map first, then everything else home. */
export function oldSiteRedirects(origin: string = PRODUCTION_ORIGIN): HostRedirect[] {
  const has = [{ type: 'host' as const, value: OLD_SITE_HOST }]
  const url = (path: string) => (path === '/' ? `${origin}/` : `${origin}${path}`)
  return [
    ...OLD_SITE_MAP.map(({ from, to }) => ({
      source: from,
      has,
      destination: url(to),
      statusCode: 301 as const,
    })),
    { source: '/:path*', has, destination: url('/'), statusCode: 301 },
  ]
}
