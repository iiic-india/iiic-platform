import type { TemplateImplementation, TemplateImplementations } from '../types'
import { certificateIssued } from './certificates'
import { dailyDigest, weeklyReport } from './internal'
import { newsletterConfirm, newsletterIssue, newsletterWelcome } from './newsletter'
import { partnershipAck, proposalSent, teamMapAck } from './pipeline'
import { complaintAck, dataRequestAck, incidentAlert, privacyDeadline } from './privacy'
import { reviewConsentReminder, reviewConsentRequest, reviewWithdrawalConfirmed } from './reviews'

/**
 * Builder C's templates (docs/19 §9): the newsletter, the review consent request and its
 * reminder, the withdrawal confirmation, the digests, the pipeline's acknowledgements and
 * proposal email (M4), and the privacy acknowledgements and reminders, the incident alerts and
 * the certificate email (M5). The backup alert is not written yet: it waits on a Supabase token
 * (O6), so the core answers `unknown-template` for it and nothing can be sent in its name.
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
  'data-request-ack': register(dataRequestAck),
  'complaint-ack': register(complaintAck),
  'privacy-deadline': register(privacyDeadline),
  'incident-alert': register(incidentAlert),
  'certificate-issued': register(certificateIssued),
}
