import { Paragraph } from '../components/Frame'
import { Button, Details, type Detail } from '../components/parts'
import type { TemplateImplementation } from '../types'
import { COPY, LABELS, placeOf, WHATSAPP_PARAMS, whenOf } from './copy'
import { CancelledData, RefundData, RescheduledData, StaffChangeData } from './data'
import { longDay, rupees } from './format'
import { loadCancelled, loadRefund, loadRescheduled, loadStaffChange } from './load'
import { BookingFrame, ManageOrJoinButton, RescheduleLine, sessionRows } from './parts'

/**
 * B7 · a booking moved or cancelled, or a refund made: the client told by email and WhatsApp, the
 * practitioner by email from the platform (docs/06 B7). A cancellation says who cancelled and
 * nothing of why: the reason staff typed stays in the admin.
 */

const moved = COPY['booking-rescheduled']

export const bookingRescheduled: TemplateImplementation<RescheduledData> = {
  load: loadRescheduled,
  email: {
    key: 'booking-rescheduled',
    schema: RescheduledData,
    subject: moved.subject,
    preheader: moved.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={moved.preheader(data)}
        eyebrow={moved.eyebrow}
        heading={moved.heading(data)}
        counselling={data.counselling}
      >
        <Paragraph>{moved.lead(data)}</Paragraph>
        <Details rows={sessionRows(data)} />
        <ManageOrJoinButton data={data} />
        <RescheduleLine />
      </BookingFrame>
    ),
  },
  whatsapp: {
    key: 'booking-rescheduled',
    schema: RescheduledData,
    params: WHATSAPP_PARAMS['booking-rescheduled'],
  },
}

const cancelled = COPY['booking-cancelled']

export const bookingCancelled: TemplateImplementation<CancelledData> = {
  load: loadCancelled,
  email: {
    key: 'booking-cancelled',
    schema: CancelledData,
    subject: cancelled.subject,
    preheader: cancelled.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={cancelled.preheader(data)}
        eyebrow={cancelled.eyebrow}
        heading={cancelled.heading(data)}
        counselling={data.counselling}
      >
        <Paragraph>{cancelled.lead(data)}</Paragraph>
        <Details
          rows={[
            { label: LABELS.what, value: data.serviceName },
            { label: LABELS.when, value: whenOf(data) },
            { label: LABELS.where, value: placeOf(data) },
            { label: LABELS.reference, value: data.reference, mono: true },
          ]}
        />
        <Paragraph>{cancelled.refund}</Paragraph>
        <Paragraph>{cancelled.rebook}</Paragraph>
      </BookingFrame>
    ),
  },
  whatsapp: {
    key: 'booking-cancelled',
    schema: CancelledData,
    params: WHATSAPP_PARAMS['booking-cancelled'],
  },
}

const refund = COPY['refund-processed']

export const refundProcessed: TemplateImplementation<RefundData> = {
  load: loadRefund,
  email: {
    key: 'refund-processed',
    schema: RefundData,
    subject: refund.subject,
    preheader: refund.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={refund.preheader()}
        eyebrow={refund.eyebrow}
        heading={refund.heading(data)}
        counselling={false}
      >
        <Paragraph>{refund.lead(data, context)}</Paragraph>
        <Details
          rows={[
            // The amount only while prices are public (D-21).
            ...(context.priceAllowed
              ? [{ label: LABELS.refunded, value: rupees(data.amountPaise) }]
              : []),
            { label: LABELS.when, value: longDay(data.processedAt) },
            { label: LABELS.reference, value: data.reference, mono: true },
          ]}
        />
        <Paragraph>{refund.questions}</Paragraph>
      </BookingFrame>
    ),
  },
}

const staff = COPY['booking-change-staff']

export const bookingChangeStaff: TemplateImplementation<StaffChangeData> = {
  load: loadStaffChange,
  email: {
    key: 'booking-change-staff',
    schema: StaffChangeData,
    subject: staff.subject,
    preheader: staff.preheader,
    element: (data, context) => {
      const rows: Detail[] = [{ label: LABELS.what, value: data.serviceName }]
      if (data.fromStartsAt) {
        rows.push({
          label: LABELS.was,
          value: whenOf({ startsAt: data.fromStartsAt, endsAt: null }),
        })
      }
      if (data.startsAt) {
        rows.push({
          label: data.fromStartsAt ? LABELS.now : LABELS.when,
          value: whenOf({ startsAt: data.startsAt, endsAt: null }),
        })
      }
      return (
        <BookingFrame
          context={context}
          preheader={staff.preheader(data)}
          eyebrow={staff.eyebrow(data)}
          heading={staff.heading(data)}
          counselling={false}
        >
          <Paragraph>{staff.lead(data)}</Paragraph>
          <Details rows={[...rows, { label: LABELS.reference, value: data.reference }]} />
          <Button href={`${context.siteUrl}/admin/collections/bookings/${data.bookingId}`}>
            {staff.button}
          </Button>
        </BookingFrame>
      )
    },
  },
}
