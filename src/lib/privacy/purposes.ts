/**
 * What a person can consent to, one purpose at a time (docs/04 `consents`; docs/08 §3: one
 * unticked checkbox per purpose, never bundled). Each consent text is versioned per purpose
 * (`consent-versions`), and each consent names the version it was given under.
 */
export const CONSENT_PURPOSES = [
  { value: 'bookingCommunications', label: 'Booking communications' },
  { value: 'marketingEmail', label: 'Marketing email' },
  { value: 'marketingWhatsapp', label: 'Marketing on WhatsApp' },
  { value: 'mapStorage', label: 'Keeping the Subjective Self Map' },
  { value: 'mapSharing', label: 'Sharing the Map with a counsellor' },
  { value: 'testimonialPublication', label: 'Publishing a testimonial' },
  { value: 'relatedProgrammes', label: 'Suggesting related programmes' },
] as const

export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number]['value']

export function purposeLabel(value: unknown): string {
  return CONSENT_PURPOSES.find((purpose) => purpose.value === value)?.label ?? String(value)
}

/**
 * How a consent, or its withdrawal, reached IIIC: a form on the site, a reply (the review
 * consent requests go by email or WhatsApp, docs/content/review-consent-request.md), a call or
 * a paper form. A withdrawal must be as easy as giving consent (docs/08 §3), so it is taken
 * however the person sends it. The last one is no channel at all: when a person's record is
 * deleted, their consents are marked withdrawn (docs/04, Rules the schema enforces).
 */
export const CONSENT_CHANNELS = [
  { value: 'web', label: 'A form on this site' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone call' },
  { value: 'inPerson', label: 'In person, on paper' },
  { value: 'recordDeleted', label: 'The person’s record was deleted' },
] as const

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number]['value']
