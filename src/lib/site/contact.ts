/**
 * IIIC's contact details as the platform prints them (D-31): the phone number of both 2026
 * brochures, info@iiicedu.com until the platform domain's addresses exist (I-02), and the
 * brochure address without a PIN until IIIC confirms how it should print (I-33). The office
 * hours are the ones IIIC's site gives (docs/09). The details live here, once, so that the
 * footer and the contact section always agree; they move to the settings when those exist.
 */
export const CONTACT = {
  phone: '+91 96240 46464',
  email: 'info@iiicedu.com',
  address: '408, The Claywalls, above Bonanza Salon, Zydus Hospital Lane, Hebatpur Road, Ahmedabad',
  hours: 'Monday to Friday, 10 AM – 6 PM',
} as const

export const CONTACT_HEADING = 'Contact'

/** A phone number as a link a phone can dial (E.164, no spaces). */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

export function mailHref(address: string): string {
  return `mailto:${address}`
}
