import type { AnalyticsEventInput } from '@/lib/analytics/events'

/**
 * The register a page is drawn in, by its address, as the route groups set it
 * (src/app/(platform)/…): the consultancy pages, the education pages, counselling, and the
 * paper default everywhere else. The forms' event names it (docs/12 §7).
 */
export function registerOf(path: string): AnalyticsEventInput['register'] {
  if (/^\/(organisations|founders)(\/|$)/.test(path)) return 'consultancy'
  if (/^\/(institute|learn|journal)(\/|$)/.test(path)) return 'education'
  if (/^\/(counselling|book\/session)(\/|$)/.test(path)) return 'counselling'
  return 'default'
}

/** A path on this site as the analytics events name it: small letters, digits, hyphens. */
export const PAGE_PATH = /^\/[a-z0-9/-]{0,199}$/
