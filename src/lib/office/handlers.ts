import type { PayloadHandler, PayloadRequest } from 'payload'

import type { Result } from '@/lib/result'

import type { OfficeActions } from './actions'
import { OFFICE_COPY, officeErrorMessage } from './copy'
import { Id } from './inputs'
import { refusalFor, type Need } from './who'

/**
 * The office's endpoints (docs/16 §12, E), registered on the bookings, refunds and working-hours
 * collections. Each checks the user, the role and the two-factor code first (CLAUDE.md #6), then
 * the record's id, then hands the body to the office's actions (src/lib/office/actions.ts), which
 * check again and validate it with Zod. The actions are loaded only when a request arrives, so the
 * Payload CLI, which loads the collections, never loads the gateway's `server-only` modules.
 *
 *   GET  /api/bookings/:id/cancel-preview   the refund each side's cancellation gives
 *   POST /api/bookings/:id/cancel           { by, reason, shownClientPaise, shownIiicPaise }
 *   POST /api/bookings/:id/reschedule       { startsAt }
 *   POST /api/bookings/:id/confirm-time     { startsAt, practitionerId? }
 *   POST /api/bookings/:id/payment-link     { expiresAt? }
 *   POST /api/refunds/:id/decide            { decision: approve | decline } (an owner)
 *   POST /api/refunds/:id/send              a failed refund, again
 *   GET  /api/availability-rules/bookable-times?practitionerId=&option=serviceId:optionId
 *
 * Answers: 200 with a message for the admin; 400 bad input; 401 no staff session; 403 without the
 * code or the role; 404 no such record; 409 the record has moved on (a taken time, a changed
 * refund); 502 or 503 when the gateway cannot be reached or is not set up. Never cached.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

type ErrorLike = {
  code: string
  reason?: string
  gatewayCode?: string
  fields?: string[]
  clientPaise?: number
  iiicPaise?: number
}

const STATUS: Record<string, number> = {
  'sign-in': 401,
  'enter-code': 403,
  'not-allowed': 403,
  forbidden: 403,
  'needs-owner': 403,
  'not-own-profile': 403,
  'no-profile': 404,
  'invalid-input': 400,
  'not-found': 404,
  'not-configured': 503,
  unavailable: 502,
  refused: 422,
  'rule-missing': 422,
  'free-service': 422,
  'prices-hidden': 422,
}

/** The HTTP status for an action's error: anything not listed is a conflict with the record. */
export function statusFor(code: string): number {
  return STATUS[code] ?? 409
}

/** The error's answer: its code, the admin's words for it, and the fields or amounts it names. */
export function errorResponse(error: ErrorLike): Response {
  return json(
    {
      code: error.code,
      message: officeErrorMessage(error),
      ...(error.fields ? { fields: error.fields } : {}),
      ...(error.code === 'refund-changed'
        ? { clientPaise: error.clientPaise, iiicPaise: error.iiicPaise }
        : {}),
    },
    statusFor(error.code),
  )
}

async function bodyOf(req: PayloadRequest): Promise<unknown> {
  return (await req.json?.().catch(() => null)) ?? {}
}

type Actions = OfficeActions

/**
 * One endpoint: the refusal first, then the id, then the action, then its answer. `answer`
 * turns a success into the body the admin shows.
 */
function endpoint<T>(
  need: Need,
  run: (actions: Actions, req: PayloadRequest, id: number) => Promise<Result<T, ErrorLike>>,
  answer: (value: T) => Record<string, unknown>,
  withId = true,
): PayloadHandler {
  return async (req) => {
    const refusal = refusalFor(req.user, need)
    if (refusal) return errorResponse(refusal)
    let id = 0
    if (withId) {
      const parsed = Id.safeParse(req.routeParams?.id)
      if (!parsed.success) return errorResponse({ code: 'not-found' })
      id = parsed.data
    }
    const { officeActions } = await import('./wiring')
    const result = await run(officeActions(), req, id)
    return result.ok ? json(answer(result.value)) : errorResponse(result.error)
  }
}

export const cancelPreviewHandler = endpoint(
  'office',
  (actions, req, id) => actions.cancelPreview(req, id),
  (preview) => ({ preview }),
)

export const cancelHandler = endpoint(
  'office',
  async (actions, req, id) => actions.cancel(req, id, await bodyOf(req)),
  ({ booking, refunds }) => ({
    message: OFFICE_COPY.cancelled(refunds),
    booking: { id: booking.id, status: booking.status },
    refunds: refunds.map((refund) => ({ id: refund.id, status: refund.status })),
  }),
)

export const rescheduleHandler = endpoint(
  'office',
  async (actions, req, id) => actions.reschedule(req, id, await bodyOf(req)),
  (booking) => ({
    message: OFFICE_COPY.rescheduled(booking.reference, booking.startsAt ?? null),
    booking: { id: booking.id, reference: booking.reference },
  }),
)

export const confirmTimeHandler = endpoint(
  'office',
  async (actions, req, id) => actions.confirmTime(req, id, await bodyOf(req)),
  (booking) => ({
    message: OFFICE_COPY.timeConfirmed(booking.startsAt ?? null),
    booking: { id: booking.id, status: booking.status },
  }),
)

export const paymentLinkHandler = endpoint(
  'office',
  async (actions, req, id) => actions.paymentLink(req, id, await bodyOf(req)),
  ({ payment, shortUrl, messaged }) => ({
    message: OFFICE_COPY.linkCreated(payment.amountPaise, messaged),
    link: shortUrl,
  }),
)

export const decideRefundHandler = endpoint(
  'owner',
  async (actions, req, id) => actions.decideRefund(req, id, await bodyOf(req)),
  (refund) => ({
    message: OFFICE_COPY.decided(refund.status),
    refund: { id: refund.id, status: refund.status },
  }),
)

export const resendRefundHandler = endpoint(
  'office',
  (actions, req, id) => actions.resendRefund(req, id),
  (refund) => ({
    message: OFFICE_COPY.refundSent,
    refund: { id: refund.id, status: refund.status },
  }),
)

export const bookableTimesHandler = endpoint(
  'hours',
  (actions, req) =>
    actions.previewHours(req, Object.fromEntries(req.searchParams?.entries() ?? [])),
  (preview) => preview,
  false,
)
