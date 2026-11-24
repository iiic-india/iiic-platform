import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { FORM_COPY, PROPOSAL_CALL } from '@/lib/enquiryForms/strings'
import { PROPOSAL_EMAIL } from '@/lib/pipeline/proposal/copy'
import type { EnquiryKind } from '@/lib/pipeline/values'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok, type Result } from '@/lib/result'
import type { Enquiry, Person } from '@/payload-types'

import { Frame } from '../components/Frame'
import { Button } from '../components/parts'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, siteLink } from './text'

/**
 * The pipeline's emails (docs/06 P1, P5, P7; docs/13 §4; docs/17 §5, §6). Each says only what the
 * person asked about: the acknowledgements repeat the form's own acknowledgement (the words in
 * src/lib/enquiryForms/strings.ts, so the page and the email never disagree), and the proposal
 * email is M4's (src/lib/pipeline/proposal/copy.ts) with its link as the one button. No amount
 * appears in any of them, whatever the fees rule answers (D-21, D-94), and no offer.
 *
 * Copy status: the forms' acknowledgement words are candidates awaiting IIIC's approval (I-41);
 * the subjects follow docs/13 §5 ("Your Team Map request").
 */

/** The first word of a name, as the greeting uses it, or nothing. */
function firstWord(name: unknown): string {
  return typeof name === 'string' ? (name.trim().split(/\s+/)[0] ?? '') : ''
}

// ---- P1, P7 · the acknowledgements ----

const AckData = z.object({ firstName: z.string(), callPath: z.string().nullable() })
type AckData = z.infer<typeof AckData>

/**
 * The acknowledgement's data, read at send time: the enquiry of this kind and its person.
 * `stale` once the office has marked it as spam (nothing is sent about spam); the greeting uses
 * the name the person typed, else the person's record, else none.
 */
export async function loadAcknowledgement(
  req: PayloadRequest,
  enquiryId: number,
  kind: EnquiryKind,
): Promise<Result<AckData, LoadError>> {
  const enquiry = (await req.payload.findByID({
    collection: 'enquiries',
    id: enquiryId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Enquiry | null
  if (!enquiry || enquiry.kind !== kind) return err({ code: 'not-found' })
  if (enquiry.status === 'spam') return err({ code: 'stale' })
  let name = firstWord(enquiry.submitted?.contactName)
  if (!name) {
    const personId = idOf(enquiry.person)
    const person =
      personId === null
        ? null
        : ((await req.payload.findByID({
            collection: 'people',
            id: Number(personId),
            depth: 0,
            disableErrors: true,
            overrideAccess: true,
            select: { fullName: true },
            req,
          })) as Pick<Person, 'fullName'> | null)
    name = firstWord(person?.fullName)
  }
  return ok({
    firstName: name,
    callPath: FORM_COPY[kind].acknowledgement.callLine ? PROPOSAL_CALL.href : null,
  })
}

function acknowledgement(
  key: 'team-map-ack' | 'partnership-ack',
  kind: EnquiryKind,
  subject: string,
): TemplateImplementation<AckData> {
  const copy = FORM_COPY[kind].acknowledgement
  const preheader = copy.lines[1] ?? copy.lines[0]
  return {
    load: (req, message) => loadAcknowledgement(req, message.subject.id, kind),
    email: {
      key,
      schema: AckData,
      subject: () => subject,
      preheader: () => preheader,
      element: (data, context) => (
        <Frame
          preheader={preheader}
          heading={copy.heading}
          footer={context.footer}
          assetUrl={context.assetUrl}
        >
          <Para>{data.firstName ? `Hello ${data.firstName},` : 'Hello,'}</Para>
          <Para>{copy.lines.join(' ')}</Para>
          {copy.callLine && data.callPath ? (
            <>
              <Para>{copy.callLine}</Para>
              <Button href={siteLink(context.siteUrl, data.callPath)}>{PROPOSAL_CALL.label}</Button>
            </>
          ) : null}
        </Frame>
      ),
    },
  }
}

/** P1 · a Team Map request acknowledged (docs/13 §5's subject). */
export const teamMapAck = acknowledgement('team-map-ack', 'teamMap', 'Your Team Map request')

/** P7 · a partnership enquiry acknowledged. */
export const partnershipAck = acknowledgement(
  'partnership-ack',
  'partnership',
  'Your partnership enquiry',
)

// ---- P5 · the proposal's tracked link ----

/**
 * The link's address must be a proposal's tracked link on this site: `/p/` and a base64url token.
 * Checked again here so a template can never be made to carry another address.
 */
const TRACKED_LINK = /^https?:\/\/[^/]+\/p\/[A-Za-z0-9_-]{20,}$/

const ProposalData = z.object({
  reference: z.string().min(1).max(60),
  clientName: z.string().min(1).max(200),
  linkUrl: z.string().regex(TRACKED_LINK),
})
type ProposalData = z.infer<typeof ProposalData>

/**
 * The proposal email's data: the reference and the client's name from the send, and the link,
 * which exists only in the send's own call (`transient`; its token is stored as a hash alone).
 * Without it the message is `stale` and never sent, so a retry or the dispatcher cannot send a
 * proposal email without its link; the proposal must still be sent or viewed.
 */
export async function loadProposalEmail(
  req: PayloadRequest,
  proposalId: number,
  transient: Readonly<Record<string, string>> | undefined,
): Promise<Result<ProposalData, LoadError>> {
  if (!transient?.linkUrl) return err({ code: 'stale' })
  const proposal = await req.payload.findByID({
    collection: 'proposals',
    id: proposalId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { status: true },
    req,
  })
  if (!proposal) return err({ code: 'not-found' })
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') return err({ code: 'stale' })
  const parsed = ProposalData.safeParse({
    reference: transient.reference,
    clientName: transient.clientName,
    linkUrl: transient.linkUrl,
  })
  return parsed.success ? ok(parsed.data) : err({ code: 'stale' })
}

/** The proposal's own words for the email body (M4's), without the link line. */
function proposalLines(data: ProposalData): string[] {
  return PROPOSAL_EMAIL.text(data)
    .split('\n')
    .filter((line) => line.trim() && !line.includes(data.linkUrl))
}

export const proposalSent: TemplateImplementation<ProposalData> = {
  load: (req, message) => loadProposalEmail(req, message.subject.id, message.transient),
  email: {
    key: 'proposal-sent',
    schema: ProposalData,
    subject: (data) => PROPOSAL_EMAIL.subject(data.reference),
    preheader: (data) => `The proposal for ${data.clientName}, as a PDF.`,
    element: (data, context) => (
      <Frame
        preheader={`The proposal for ${data.clientName}, as a PDF.`}
        heading="Your proposal from IIIC"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        {proposalLines(data).map((line) => (
          <Para key={line}>{line}</Para>
        ))}
        <Button href={data.linkUrl}>Open the proposal</Button>
      </Frame>
    ),
  },
}
