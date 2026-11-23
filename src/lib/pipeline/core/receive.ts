import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { inTransaction, keepOk } from '@/lib/booking/guard'
import { currentNotice } from '@/lib/privacy/consents'
import { err, ok, type Result } from '@/lib/result'
import { IST } from '@/lib/time/ist'

import type { PipelineError, ReceiveEnquiry, ReceivedEnquiry } from '../leads'
import type { LeadKind } from '../stages'
import { FIRST_REPLY_WORKING_DAYS } from '../tasks'
import type { EnquiryOutcome, LeadSource, TeamSizeBand } from '../values'
import { logActivity } from './activities'
import { emitPipelineEvent } from './emit'
import { findMatches, keysFor, organisationTypeFor } from './match'
import { personSourceFor, taskTitle } from './strings'
import { createTask } from './tasks'
import { addWorkingDays } from './workingDays'

/**
 * Receiving a request from a public form (docs/17 §4; src/lib/pipeline/leads.ts, ReceiveEnquiry):
 * one transaction, in the design's order, that stores nothing unless it stores all of it. The
 * notice is checked before anything is written, so a stale form stores nothing; the consent
 * ledger checks it again as it records the consent. Nothing here logs what the person typed.
 */

/** The consent a request needs, and the language its notice is in (en-IN in Release 1). */
const PURPOSE = 'enquiryReplies'
const LANGUAGE = 'en-IN'

/** The two forms' fields in one shape, as the enquiry keeps them. */
type Submitted = {
  organisationName: string
  website: string | null
  teamSizeBand: TeamSizeBand | null
  sector: string | null
  name: string
  role: string
  email: string
  mobile: string
  message: string | null
}

type Plan = {
  submitted: Submitted
  leadKind: LeadKind
  source: LeadSource
  automation: 'P1' | 'P7'
}

function planFor(input: ReceivedEnquiry): Plan {
  if (input.kind === 'teamMap') {
    const f = input.fields
    return {
      submitted: {
        organisationName: f.company,
        website: f.website ?? null,
        teamSizeBand: f.teamSizeBand,
        sector: f.sector,
        name: f.name,
        role: f.role,
        email: f.email,
        mobile: f.mobile,
        message: f.prompt ?? null,
      },
      leadKind: 'consultancy',
      source: 'teamMapForm',
      automation: 'P1',
    }
  }
  const f = input.fields
  return {
    submitted: {
      organisationName: f.institution,
      website: null,
      teamSizeBand: null,
      sector: null,
      name: f.name,
      role: f.role,
      email: f.email,
      mobile: f.phone,
      message: f.nature,
    },
    leadKind: 'partnership',
    source: 'partnershipForm',
    automation: 'P7',
  }
}

type Received = { enquiryId: number; leadId: number; outcome: EnquiryOutcome }

async function store(
  req: PayloadRequest,
  input: ReceivedEnquiry,
  noticeId: number,
): Promise<Result<Received, PipelineError>> {
  const { submitted, leadKind, source, automation } = planFor(input)
  const { context } = input
  const receivedAt = context.receivedAt.toISOString()
  const keys = keysFor({
    name: submitted.organisationName,
    website: submitted.website,
    email: submitted.email,
  })
  const matches = await findMatches(req, {
    kind: leadKind,
    email: submitted.email,
    mobile: submitted.mobile,
    organisation: keys,
  })
  const write = { depth: 0, overrideAccess: true, req } as const

  // 1. The person: the one matched, linked and never changed, or one made from the form.
  let personId = matches.personId
  const personMade = personId === null
  if (personId === null) {
    const person = await req.payload.create({
      collection: 'people',
      data: {
        fullName: submitted.name,
        email: submitted.email,
        mobile: submitted.mobile,
        jobTitle: submitted.role,
        organisation: matches.organisationId ?? undefined,
        source: personSourceFor(input.kind),
        utm: context.utm,
        language: LANGUAGE,
      },
      ...write,
    })
    personId = person.id
  }

  // 2. The consent, under the notice the form showed, with the form's evidence.
  const consent = await req.payload.create({
    collection: 'consents',
    data: {
      person: personId,
      noticeVersion: noticeId,
      grantedAt: receivedAt,
      channel: 'web',
      evidence: {
        form: context.evidence.form,
        ip: context.evidence.ip,
        userAgent: context.evidence.userAgent,
      },
    } as RequiredDataFromCollectionSlug<'consents'>,
    ...write,
  })

  // 3. The organisation: the one matched, never changed, or one made from the form.
  let organisationId = matches.organisationId
  if (organisationId === null) {
    const organisation = await req.payload.create({
      collection: 'organisations',
      data: {
        name: submitted.organisationName,
        type: organisationTypeFor(leadKind),
        website: submitted.website ?? undefined,
        sector: submitted.sector ?? undefined,
        teamSizeBand: submitted.teamSizeBand ?? undefined,
        domain: keys.domain ?? undefined,
        nameKey: keys.nameKey,
      },
      ...write,
    })
    organisationId = organisation.id
    // A person made just now works there; a person matched is left as they are.
    if (personMade) {
      await req.payload.update({
        collection: 'people',
        id: personId,
        data: { organisation: organisationId },
        ...write,
      })
    }
  }

  // 4. The enquiry, as typed, with the consent it was stored under.
  const outcome: EnquiryOutcome = matches.openLeadId === null ? 'newLead' : 'existingLead'
  const enquiry = await req.payload.create({
    collection: 'enquiries',
    data: {
      kind: input.kind,
      status: 'received',
      outcome,
      receivedAt,
      receivedAt_tz: IST,
      submitted: {
        organisationName: submitted.organisationName,
        website: submitted.website,
        teamSizeBand: submitted.teamSizeBand,
        sector: submitted.sector,
        contactName: submitted.name,
        role: submitted.role,
        email: submitted.email,
        mobile: submitted.mobile,
        message: submitted.message,
      },
      person: personId,
      organisation: organisationId,
      lead: matches.openLeadId ?? undefined,
      conflict: matches.conflict,
      consents: [consent.id],
      page: context.page,
      turnstile: context.turnstile,
      utm: context.utm,
      submitterHash: context.submitterHash,
    },
    ...write,
  })

  // 5. The lead: the open one it matched, or a new one in New that names an ended one.
  let leadId = matches.openLeadId
  if (leadId === null) {
    const lead = await req.payload.create({
      collection: 'leads',
      data: {
        kind: leadKind,
        stage: 'new',
        organisation: organisationId,
        person: personId,
        source,
        utm: context.utm,
        previousLead: matches.previousLeadId ?? undefined,
      },
      ...write,
    })
    leadId = lead.id
    await req.payload.update({
      collection: 'enquiries',
      id: enquiry.id,
      data: { lead: leadId },
      ...write,
    })
  }

  // 6. The timeline, and the first reply's task unless the lead has one open.
  const logged = await logActivity(req, {
    leadId,
    type: 'enquiry',
    at: context.receivedAt,
    by: null,
    about: { enquiryId: enquiry.id },
  })
  if (!logged.ok) return logged
  const open = await req.payload.count({
    collection: 'tasks',
    where: {
      and: [
        { lead: { equals: leadId } },
        { kind: { equals: 'firstReply' } },
        { status: { equals: 'open' } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (open.totalDocs === 0) {
    const task = await createTask(req, {
      kind: 'firstReply',
      title: taskTitle('firstReply'),
      dueOn: addWorkingDays(context.receivedAt, FIRST_REPLY_WORKING_DAYS),
      role: 'operator',
      leadId,
      automation,
      key: `${automation}:enquiry:${enquiry.id}`,
    })
    if (!task.ok) return task
  }

  // 7. The event; `lead.created` and `task.created` came from the records' own hooks.
  await emitPipelineEvent(req, {
    name: 'enquiry.received',
    enquiryId: enquiry.id,
    leadId,
    kind: input.kind,
    outcome,
  })
  return ok({ enquiryId: enquiry.id, leadId, outcome })
}

/**
 * ReceiveEnquiry: refused with `no-notice` while no consent text for replies to an enquiry is in
 * force, and with `notice-changed` when the form showed another version than the one in force;
 * otherwise stored whole, or not at all.
 */
export const receiveEnquiry: ReceiveEnquiry = async (req, input) => {
  const notice = await currentNotice(req.payload, PURPOSE, LANGUAGE, input.context.receivedAt)
  if (!notice) return err({ code: 'no-notice' })
  if (notice.id !== input.fields.noticeVersion) return err({ code: 'notice-changed' })
  return inTransaction(req, () => store(req, input, notice.id), keepOk)
}
