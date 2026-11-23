import type { TemplateImplementation, TemplateImplementations } from '../types'

import { failureAlert } from './failureAlert'

/** Builder A's template (docs/19 §9): the failure alert to an owner (O3). */
export const CORE_TEMPLATES: TemplateImplementations = {
  // Each template's data type is its own; the map holds them side by side.
  'failure-alert': failureAlert as unknown as TemplateImplementation<never>,
}
