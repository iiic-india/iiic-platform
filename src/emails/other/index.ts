import type { TemplateImplementation, TemplateImplementations } from '../types'
import { dailyDigest, weeklyReport } from './internal'
import { newsletterConfirm, newsletterIssue, newsletterWelcome } from './newsletter'
import { reviewConsentReminder, reviewConsentRequest, reviewWithdrawalConfirmed } from './reviews'

/**
 * Builder C's templates (docs/19 §9): the newsletter, the review consent request and its
 * reminder, the withdrawal confirmation and the digests. The pipeline acknowledgements (M4), the
 * privacy acknowledgements and deadlines, the incident alert and the certificate email (M5) and
 * the backup alert are not written yet: each reads records those milestones add, so until then
 * the core answers `unknown-template` for them and nothing can be sent in their name.
 */
const register = <Data>(implementation: TemplateImplementation<Data>) =>
  implementation as unknown as TemplateImplementation<never>

export const OTHER_TEMPLATES: TemplateImplementations = {
  'newsletter-confirm': register(newsletterConfirm),
  'newsletter-welcome': register(newsletterWelcome),
  'newsletter-issue': register(newsletterIssue),
  'review-consent-request': register(reviewConsentRequest),
  'review-consent-reminder': register(reviewConsentReminder),
  'review-withdrawal-confirmed': register(reviewWithdrawalConfirmed),
  'daily-digest': register(dailyDigest),
  'weekly-report': register(weeklyReport),
}
