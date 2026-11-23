import 'server-only'

import type { ReceiveEnquiry } from '@/lib/pipeline/leads'
import { err } from '@/lib/result'

/**
 * The CRM operation the forms hand a request to (docs/17 §4, §12). The CRM core (builder A,
 * `src/lib/pipeline/core/receive.ts`) implements `ReceiveEnquiry`; the lead points this at it
 * when the slices join. Until then the forms refuse politely ("This form cannot be sent just
 * now", with the office's email) rather than drop a request: nothing is stored, and nothing is
 * pretended. The tests give the forms a fake instead (tests/unit/enquiryFormsSubmit.spec.ts).
 */
export const receiveEnquiry: ReceiveEnquiry = async () => err({ code: 'no-notice' })
