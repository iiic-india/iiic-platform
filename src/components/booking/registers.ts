import type { Register } from '@/components/site/SiteFrame'

/**
 * The register a booking's own pages are drawn in (docs/02: "from type"): counselling for a
 * session, consultancy for a call, education for an info session. A reference names its kind
 * by its letter (IIIC-S-…, IIIC-C-…, IIIC-I-…; docs/16 §6), so the payment step and the
 * confirmation take their register from the address alone, before anything is read.
 */
export function registerOfType(type: string | null | undefined): Register | undefined {
  if (type === 'session') return 'counselling'
  if (type === 'call') return 'consultancy'
  if (type === 'info') return 'education'
  return undefined
}

const LETTER_TYPES: Record<string, string> = { S: 'session', C: 'call', I: 'info' }

export function typeOfReference(reference: string): string | null {
  const match = /^IIIC-([SCI])-\d{5}$/.exec(reference)
  return match ? (LETTER_TYPES[match[1] as string] ?? null) : null
}

export function registerOfReference(reference: string): Register | undefined {
  return registerOfType(typeOfReference(reference))
}
