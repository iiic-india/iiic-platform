# WhatsApp templates for Meta approval (Release 1)

The eight utility templates of `docs/06` § Message templates, as they are submitted to Meta through AiSensy in M6 (`docs/13` §7). Each names the person's own booking and carries nothing said in a session and no offer (`docs/06`, Engine rules and the counselling guardrail). The variables are filled by `WHATSAPP_PARAMS` in `src/emails/booking/copy.ts`, in the order numbered here; `tests/unit/bookingTemplates.spec.tsx` checks that each text has as many variables as the code sends.

Status: `[proposal]`. The words are drafts to `src/brand/VOICE.md`, for IIIC's approval (I-41); the scope and crisis line comes from `src/lib/counselling/scope.ts` and waits on the lawyer (I-22). Nothing is submitted until the WhatsApp number is settled (I-03, I-40). Once approved, each template's provider name and status are entered in Admin → Messages → Templates.

For every template: category **Utility**, language **English (en)**, no header, no buttons (a link is a variable in the body), no emoji. A variable never holds a line break and is never empty. The phone number is the one on both 2026 brochures (D-31); if it changes, the templates that carry it are submitted again.

The closing variable of the five templates about a booking's time (`whatsappClosing`: confirmed, the two reminders, rescheduled and cancelled) is the booking's reference, and for a counselling booking the reference followed by the scope and crisis line: "Sessions at IIIC are non-clinical conversations based on the Subjective Self framework. They are not diagnosis or treatment, and they are not an emergency service. If you need help now: Tele-MANAS 14416 or 1-800-891-4416 (free, 24×7); Emergencies 112; Children 1098." So one approved text serves every booking, and a counselling one always carries the line.

## booking-confirmed · `iiic_booking_confirmed`

B2. Variables: first name, service, day, time, the place or the Meet link, the closing.

```text
{{1}}, your {{2}} with IIIC is booked for {{3}} at {{4}}.
Where: {{5}}
To reschedule, reply to this message or call +91 96240 46464.
{{6}}
```

## reminder-24h · `iiic_reminder_24h`

B5, a day before. It does not say "tomorrow": quiet hours can move it to the morning of the session. Variables: first name, service, day, time, the place or the Meet link, the closing.

```text
{{1}}, a reminder: your {{2}} is on {{3}} at {{4}}.
Where: {{5}}
To reschedule, reply to this message or call +91 96240 46464.
{{6}}
```

## reminder-short · `iiic_reminder_short`

B6, 2 hours before an office session and 30 minutes before an online one. Variables: first name, service, time, the place or the Meet link, the closing.

```text
{{1}}, your {{2}} starts today at {{3}}.
Where: {{4}}
To reschedule, reply to this message or call +91 96240 46464.
{{5}}
```

## booking-rescheduled · `iiic_booking_rescheduled`

B7, the new time. Variables: first name, service, the new day, the new time, the place or the Meet link, the closing.

```text
{{1}}, your {{2}} has moved to {{3}} at {{4}}.
Where: {{5}}
To change it again, reply to this message or call +91 96240 46464.
{{6}}
```

## booking-cancelled · `iiic_booking_cancelled`

B7. It says nothing of why; a refund is told by email. Variables: first name, service, day, time, the closing.

```text
{{1}}, your {{2}} on {{3}} at {{4}} is cancelled.
To book another time, reply to this message or call +91 96240 46464.
{{5}}
```

## feedback-request · `iiic_session_feedback`

B8. Not submitted until M5's feedback page gives each booking its link; until then the request goes by email only. Variables: first name, service, day, the feedback link.

```text
{{1}}, how was your {{2}} on {{3}}? There is one question, a rating from 1 to 5: {{4}}
```

## time-request-received · `iiic_time_request_received`

B12. It promises no time. Variables: first name, service, the booking's reference.

```text
{{1}}, we have your request for a {{2}}. Someone at IIIC will reply with a time, or with a question if none of the days you gave is free. Nothing is booked until we confirm a time with you. Booking ID {{3}}.
```

## payment-link · `iiic_payment_link`

B13, sent when staff send a payment link (D-24): the person's own amount. Variables: first name, service, day, the amount, the payment link.

```text
{{1}}, here is the link to pay for your {{2}} on {{3}}. The amount is {{4}}.
{{5}}
Questions about the payment? Reply to this message or call +91 96240 46464.
```
