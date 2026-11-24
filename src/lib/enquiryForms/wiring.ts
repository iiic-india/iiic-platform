import 'server-only'

import { receiveEnquiry as receiveInCrm } from '@/lib/pipeline/core/receive'
import type { ReceiveEnquiry } from '@/lib/pipeline/leads'

/**
 * The CRM operation the forms hand a request to (docs/17 §4, §12): the CRM core's
 * `ReceiveEnquiry` (src/lib/pipeline/core/receive.ts), which records the consent under the notice
 * the form showed and stores the person, organisation, enquiry, lead, activity and task in one
 * transaction, or nothing. The tests give the forms a fake instead
 * (tests/unit/enquiryFormsSubmit.spec.ts).
 */
export const receiveEnquiry: ReceiveEnquiry = receiveInCrm
