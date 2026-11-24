import type { PageContent } from '@/lib/content/types'

import { formKindsIn, NO_FORMS, type PageForms } from './state'

/**
 * The forms a page carries and what each needs (src/lib/enquiryForms/setup.ts), asked by the
 * page as it is drawn. A page with no form block asks nothing: the setup, with the database,
 * the secret and the forms' actions, is loaded only for a page that has one. Never imported by
 * a client component.
 */
export async function formsOn(layout: PageContent['layout'], page: string): Promise<PageForms> {
  if (formKindsIn(layout).length === 0) return NO_FORMS
  const { formsFor } = await import('./setup')
  return formsFor(layout, page)
}
