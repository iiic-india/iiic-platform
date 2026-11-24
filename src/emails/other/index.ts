import type { TemplateImplementation, TemplateImplementations } from '../types'
import { dailyDigest, weeklyReport } from './internal'
import { newsletterConfirm, newsletterIssue, newsletterWelcome } from './newsletter'
import { partnershipAck, proposalSent, teamMapAck } from './pipeline'
import { reviewConsentReminder, reviewConsentRequest, reviewWithdrawalConfirmed } from './reviews'

/**
 * Builder C's templates (docs/19 §9): the newsletter, the review consent request and its
 * reminder, the withdrawal confirmation, the digests, and since M4 joined, the pipeline's
 * acknowledgements and proposal email. The privacy acknowledgements and deadlines, the incident
 * alert and the certificate email (M5) and the backup alert are not written yet: each reads
 * records M5 adds, so until then the core answers `unknown-template` for them and nothing can be
 * sent in their name.
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
  'team-map-ack': register(teamMapAck),
  'partnership-ack': register(partnershipAck),
  'proposal-sent': register(proposalSent),
}
