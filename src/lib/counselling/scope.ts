/**
 * The scope statement and the crisis numbers that every counselling surface carries: the
 * page, and later the booking flow, Map results and counselling emails (docs/08 §7;
 * src/brand/VOICE.md, "Counselling copy"). The wording lives here, once, so that it is the
 * same everywhere. It is a draft until the lawyer fixes it (I-22), and the numbers are checked
 * again before each release.
 */

/** The input the wording waits on: the lawyer's review. */
export const SCOPE_AWAITS = 'I-22'

export const SCOPE_HEADING = 'What a session is, and what it is not'

export const SCOPE_STATEMENT = [
  'Sessions at IIIC are non-clinical conversations based on the Subjective Self framework.',
  'They are not diagnosis or treatment, and they are not an emergency service.',
  'What you say in a session stays private, within the limits the law sets, including where a child may be at risk.',
  'Anyone under 18 needs the consent of a parent or guardian.',
] as const

export const CRISIS_HEADING = 'If you need help now'

/** docs/08 §7: Tele-MANAS (KIRAN was merged into it), emergencies, and the children's line. */
export const CRISIS_LINES = [
  { label: 'Tele-MANAS', numbers: ['14416', '1-800-891-4416'], note: 'free, 24×7' },
  { label: 'Emergencies', numbers: ['112'], note: null },
  { label: 'Children', numbers: ['1098'], note: null },
] as const

/** A number as a link a phone can dial. */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}
