# Operator guide

One page for whoever runs IIIC's office from the admin (the operator role, `05`). It says what to do each day and where, and what never to do. The training session at launch walks through it (`10` M7); the screens are described in `05` and `18`.

## Signing in

- Open `/admin` on the platform's address, sign in with your email and password, then enter the six-digit code from your authenticator app. Nothing opens without the code.
- Lost your phone? Ask an owner to reset your two-factor; you set up a new authenticator when you next sign in. Use one of your recovery codes if no owner is free.
- Never share an account or a code. Each person has their own, and every change is recorded under their name in the audit log.

## Every morning

1. **Today.** Read the schedule, in time order. Mark each session attended or a no-show once it has happened.
2. **Needs a reply.** New Team Map requests and partnership enquiries, with how long each has waited (amber after 24 hours, red after 48). Open each, give it an owner, log your call, and move its stage.
3. **Money.** Held slots waiting for payment, failed payments and refunds waiting for an owner's approval. Approve only what your role allows; refunds above the threshold go to an owner.
4. **Privacy.** Open requests and the days left on each. Acknowledge within 48 hours; prepare the answer; an owner confirms an erasure.
5. **Something failed.** Messages that bounced, webhooks that failed. Retry, or tell an owner if the same thing fails twice.

## The work, by task

| Task | Where | Steps |
| --- | --- | --- |
| A client asks to move a session | Search (`/` or Ctrl K) by phone, email or reference → the booking | Reschedule → pick a free time → confirm. Once the automations run (M6), the client and the practitioner are told; until then, tell them yourself. |
| A client cancels | The booking | Cancel → the reason → the refund the rule gives is shown before you confirm. Above the threshold, an owner approves. |
| A time request from the booking flow | Today → Needs a reply → the request | Offer a time from the practitioner's free times, or accept the one asked for. |
| A new Team Map request | Pipeline → the lead | Assign it, log the call, then **Move to stage**, on the board or on the lead's own page. Lost or Closed needs a reason. |
| A proposal | The lead → Proposals | Write it, preview it, create a version, send it. The client's opening shows as "Opened by the client"; your own opening never counts as theirs. |
| An invoice PDF | Money → Invoices → the invoice | Owners and finance only. **Download the PDF**; each download is recorded. |
| Certificates | Learning → Certificates → Issue | Check the preview for every name as it should print, then issue. Only an owner revokes or reissues. |
| A page or an article | Content | Editors write; check the preview before publishing. A placeholder (`[[TODO: …]]`) must never be published on a public page. |

## Never

- **Never show or type a price** anywhere a client can see it while prices are not public (D-21): not in an email, a WhatsApp message, a proposal or a page.
- **Never use anything said in counselling** for marketing, follow-ups or reports. Session notes belong to the practitioner who wrote them; you cannot open them, and nobody should ask you to.
- **Never describe counselling** as therapy, treatment or diagnosis, and never call a certificate a degree or diploma (CLAUDE.md #9).
- **Never write a client's details** into a chat, a spreadsheet or a ticket. Look them up in the admin when you need them.
- **Never change a booking's or a lead's status by hand** in a form to get round a refusal: the admin refuses for a reason. Ask an owner.

## When something is wrong

- The site is down, payments are failing, or you think someone has seen data they should not: tell an owner at once. A possible breach is recorded in Privacy → Breach register with the time you noticed it, because the clocks start then (`runbook.md`, "Responding to a breach").
- Whom to call out of hours: <span class="iiic-todo">[[TODO: the two people who act on an incident, and how to reach them out of hours, I-60]]</span>.
- A client in distress during a call or a message: give the crisis numbers on the counselling page (Tele-MANAS 14416 or 1-800-891-4416, emergencies 112, children 1098) and tell the practitioner.
