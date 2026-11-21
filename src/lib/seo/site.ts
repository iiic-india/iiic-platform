/**
 * The facts every search surface reads (the metadata, the JSON-LD, robots.txt, the sitemap and
 * llms.txt), in one place so that they cannot drift apart. Each one is recorded in the docs:
 * the name and its acronym in every source (D-63), the platform domain (D-05), the contact
 * details through src/lib/site/contact.ts (D-31), the founder's title from the brochure
 * (docs/content/sources/brochures-2026.md; D-64). A fact still waiting on IIIC is left out,
 * never filled in: the PIN and map position (I-33), the legal name (I-26), the profile URLs
 * (I-34), the founding year.
 */

/** The platform's production origin (D-05): where every canonical URL and @id points. */
export const PRODUCTION_ORIGIN = 'https://imagecatalysts.in'

/** The organisation's one name, and the one other name IIIC uses for itself (D-63). */
export const SITE_NAME = 'Indian Institute of Image Catalysts'
export const SITE_ALTERNATE_NAMES = ['IIIC'] as const

/** The site's language, as the <html> element and the Content-Language header give it. */
export const SITE_LANGUAGE = 'en-IN'

/**
 * IIIC's first sentence about itself (content/sources/iiic-philosophy-2026-11-19.md), without
 * "(IIIC)" so that it fits a meta description's 155 characters (docs/12 §3). Pages without a
 * description of their own fall back to it.
 */
export const SITE_DESCRIPTION =
  'The Indian Institute of Image Catalysts operates across three distinct service verticals: Education, Counselling, and Business & Management Consultancy.'

/** The home page's fixed title (docs/12 §3), which the layout's template does not extend. */
export const HOME_TITLE = 'Indian Institute of Image Catalysts · Subjective Self'

/** The template the platform layout puts round every other page's title. */
export const TITLE_SUFFIX = ' · IIIC'

/** The founder, as the brochure names him (D-64): no honorific, no year counts (I-32). */
export const FOUNDER = { name: 'Gaurang Mistry', jobTitle: 'Image Consultant' } as const

/** The framework's definition, word for word (content/sources/iiic-description-2026-11-04.md). */
export const FRAMEWORK_DEFINITION =
  'Subjective Self is a psychological framework that encourages individuals to look at themselves as a subject rather than merely as an object of their circumstances.'

/**
 * The origin canonical URLs and structured data point at. Production sets NEXT_PUBLIC_SITE_URL
 * to the platform domain; previews leave it unset and still point at the real domain, so a
 * preview never presents itself as the original (plan A1). CI and local runs set it to their
 * own origin, which lets the tests follow each canonical URL. Anything that is not a web
 * address ("localhost:3000" without its scheme parses as a URL with no origin) counts as unset.
 */
export function siteOrigin(value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value) return PRODUCTION_ORIGIN
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : PRODUCTION_ORIGIN
  } catch {
    return PRODUCTION_ORIGIN
  }
}

/**
 * A path as its canonical form: lower case, one slash between its parts and one before the
 * first, no trailing slash, no query and no fragment. "/About/?utm_source=x" and "/about" are
 * one page.
 */
export function canonicalPath(path: string): string {
  const bare = (path.split(/[?#]/)[0] ?? '')
    .toLowerCase()
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
  return bare === '' ? '/' : bare.startsWith('/') ? bare : `/${bare}`
}

/** The absolute canonical URL of a path on the platform. */
export function canonicalUrl(path: string, origin: string = siteOrigin()): string {
  const clean = canonicalPath(path)
  return clean === '/' ? `${origin}/` : `${origin}${clean}`
}

/** Whether a value still holds a placeholder, which no search surface may carry (CLAUDE.md #1). */
export function hasPlaceholder(value: string): boolean {
  return /\[\[|\]\]|TODO/.test(value)
}

/**
 * A text a search surface may show: the value without the space around it, or nothing when it
 * is empty or still holds a placeholder. The metadata, the structured data and llms.txt all ask
 * this one question, so that they leave out the same things.
 */
export function fact(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text && !hasPlaceholder(text) ? text : undefined
}
