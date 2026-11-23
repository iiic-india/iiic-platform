import { BOOKING_TEMPLATES } from './booking'
import { CORE_TEMPLATES } from './core'
import { OTHER_TEMPLATES } from './other'
import type { TemplateKey } from './registry'
import type { TemplateImplementation, TemplateImplementations } from './types'

/**
 * Every template's implementation, by key (docs/19 §7, §9): builder A's failure alert
 * (`src/emails/core/`), builder B's booking messages (`src/emails/booking/`) and builder C's
 * pipeline, newsletter, privacy, review, certificate and internal messages (`src/emails/other/`).
 * Each builder fills only its own map, so no two edit one file. Frozen.
 */
export const IMPLEMENTATIONS: TemplateImplementations = {
  ...CORE_TEMPLATES,
  ...BOOKING_TEMPLATES,
  ...OTHER_TEMPLATES,
}

export function implementationOf(key: TemplateKey): TemplateImplementation<never> | undefined {
  return IMPLEMENTATIONS[key]
}
