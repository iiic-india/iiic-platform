import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { PipelineEvent } from '@/lib/pipeline/events'
import type { PartnershipEnquiry, TeamMapRequest } from '@/lib/pipeline/forms'
import type { EnquiryContext } from '@/lib/pipeline/leads'
import type { Booking, ConsentVersion, Lead, Person, Service } from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

// The events the CRM core emits, recorded instead of queued, and a failure to throw part-way.
const events = vi.hoisted(() => ({
  emitted: [] as PipelineEvent[],
  failOn: null as PipelineEvent['name'] | null,
}))

vi.mock('@/lib/pipeline/core/emit', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/pipeline/core/emit')>()
  return {
    ...real,
    emitPipelineEvent: async (_req: unknown, event: PipelineEvent) => {
      if (events.failOn === event.name) throw new Error('A fake failure part-way (int.pipeline)')
      events.emitted.push(event)
    },
  }
})

const { receiveEnquiry } = await import('@/lib/pipeline/core/receive')
const { raiseLeadAlerts } = await import('@/lib/pipeline/core/alerts')
const { applyMove } = await import('@/lib/pipeline/core/moves')
const { logActivity } = await import('@/lib/pipeline/core/activities')
const { attachCall } = await import('@/lib/pipeline/core/calls')
const { addWorkingDays } = await import('@/lib/pipeline/core/workingDays')
const { leadTitle, SPAM_REASON } = await import('@/lib/pipeline/core/strings')
const { FIRST_REPLY_WORKING_DAYS } = await import('@/lib/pipeline/tasks')

// The CRM core against the real Postgres (docs/17 §4, §7, §9, §11): a request becomes a person,
// a consent under the notice shown, an organisation, an enquiry, a lead in New, its timeline
// entry and the operator's first-reply task, in one transaction; a repeat joins the open lead; a
// stale notice and a failure part-way store nothing; spam ends the lead it made; erasure takes a
// person's enquiries and their link to the lead; the alerts job raises each alert once. Every
// name, address, number and text is an obviously fake test value; everything this file made is
// removed at the end, except the consent texts and entries, which are kept for good (docs/04).

let payload: Payload
const TAG = 'int.pipeline'
const RUN = Date.now().toString(36)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Seven digits of this run, for fake Indian mobile numbers. */
const DIGITS = String(Date.now()).slice(-7)
let notice: ConsentVersion

const fresh = () => createLocalReq({}, payload)
const domain = (label: string) => `${label}-${RUN}.example`
const email = (label: string, at = label) => `${label}@${domain(at)}`
/** A fake Indian mobile number of this run, +91 98 and eight digits. */
const mobile = (digit: number) => `+9198${DIGITS}${digit}`

function teamMap(label: string, digit: number, changes: Partial<TeamMapRequest> = {}) {
  const fields: TeamMapRequest = {
    company: `Fake Company ${TAG} ${label}`,
    website: `https://www.${domain(label)}`,
    teamSizeBand: 'from11to50',
    sector: 'Fake sector',
    name: `Fake Person ${TAG} ${label}`,
    role: 'Fake role',
    email: email(label),
    mobile: mobile(digit),
    prompt: 'Fake words typed in the form (int.pipeline).',
    consent: 'yes',
    noticeVersion: notice.id,
    ...changes,
  }
  return fields
}

function partnership(label: string, digit: number): PartnershipEnquiry {
  return {
    institution: `Fake Institution ${TAG} ${label}`,
    name: `Fake Person ${TAG} ${label}`,
    role: 'Fake role',
    email: email(label),
    phone: mobile(digit),
    nature: 'Fake words about a partnership (int.pipeline).',
    consent: 'yes',
    noticeVersion: notice.id,
  }
}

const context = (receivedAt = new Date()): EnquiryContext => ({
  page: '/organisations/team-map',
  utm: { source: 'fake-int-source' },
  evidence: { ip: '203.0.113.9', userAgent: 'Fake browser (int.pipeline)', form: 'teamMapRequest' },
  submitterHash: 'fake-submitter-hash-int-pipeline',
  turnstile: 'off',
  receivedAt,
})

/** A Team Map request received now, and the lead it is on. */
async function requested(label: string, digit: number): Promise<number> {
  const result = await receiveEnquiry(await fresh(), {
    kind: 'teamMap',
    fields: teamMap(label, digit),
    context: context(),
  })
  if (!result.ok) throw new Error(`The fake request was refused: ${result.error.code}`)
  return result.value.leadId
}

const leadDoc = (id: number) =>
  payload.findByID({ collection: 'leads', id, depth: 0 }) as Promise<Lead>

const count = async (
  collection: 'people' | 'organisations' | 'enquiries' | 'tasks' | 'lead-activities' | 'leads',
  where: Parameters<Payload['count']>[0]['where'],
) => (await payload.count({ collection, where })).totalDocs

/** What a request left behind: its person, its organisation, its enquiries and its leads. */
const leftBy = async (label: string) => ({
  people: await count('people', { email: { equals: email(label) } }),
  organisations: await count('organisations', { domain: { equals: domain(label) } }),
  enquiries: await count('enquiries', { 'submitted.email': { equals: email(label) } }),
  leads: await count('leads', { title: { like: `${TAG} ${label}` } }),
})

const NOTHING = { people: 0, organisations: 0, enquiries: 0, leads: 0 }

/** A consent text for replies to an enquiry, in force from `from`. */
const enquiryNotice = (from: Date) =>
  payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'enquiryReplies',
      language: 'en-IN',
      text: 'Fake consent text for replies to an enquiry (int.pipeline).',
      effectiveFrom: from.toISOString(),
    } as ConsentVersion,
  })

/** Removes this file's data, a run that stopped half-way included, children first. */
async function removeTestData() {
  const { docs } = await payload.find({
    collection: 'leads',
    where: { title: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const ids = docs.map((lead) => lead.id)
  if (ids.length) {
    await payload.delete({ collection: 'tasks', where: { lead: { in: ids } } })
    await payload.delete({ collection: 'lead-activities', where: { lead: { in: ids } } })
    await payload.delete({ collection: 'enquiries', where: { lead: { in: ids } } })
    await payload.delete({ collection: 'leads', where: { id: { in: ids } } })
  }
  await payload.delete({
    collection: 'enquiries',
    where: { 'submitted.contactName': { like: TAG } },
  })
  await payload.delete({ collection: 'bookings', where: { 'person.fullName': { like: TAG } } })
  // The people's consents are withdrawn as they go, and the entries kept (docs/04).
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'organisations', where: { name: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-pipeline' } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // Consent texts are kept for good, so each run adds its own, the latest in force.
  notice = await enquiryNotice(new Date(Date.now() - 2 * 60 * 1000))
})

afterAll(async () => {
  await removeTestData()
})

describe('a Team Map request becomes a lead with an operator task (P1; docs/17 §4)', () => {
  let leadId: number
  let organisationId: number
  let personId: number

  it('writes the person, the consent, the organisation, the enquiry, the lead, its entry and the task', async () => {
    const receivedAt = new Date()
    const result = await receiveEnquiry(await fresh(), {
      kind: 'teamMap',
      fields: teamMap('one', 1),
      context: context(receivedAt),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.outcome).toBe('newLead')
    leadId = result.value.leadId
    const { enquiryId } = result.value

    const people = await payload.find({
      collection: 'people',
      where: { email: { equals: email('one') } },
      depth: 0,
    })
    expect(people.docs).toHaveLength(1)
    const person = people.docs[0]!
    personId = person.id
    expect(person).toMatchObject({
      fullName: `Fake Person ${TAG} one`,
      mobile: mobile(1),
      jobTitle: 'Fake role',
      source: 'Team Map request',
    })

    const consents = await payload.find({
      collection: 'consents',
      where: { person: { equals: personId } },
      depth: 0,
    })
    expect(consents.docs).toHaveLength(1)
    const consent = consents.docs[0]!
    expect(consent).toMatchObject({
      purpose: 'enquiryReplies',
      noticeVersion: notice.id,
      grantedAt: receivedAt.toISOString(),
    })

    const lead = await leadDoc(leadId)
    expect(lead).toMatchObject({
      kind: 'consultancy',
      stage: 'new',
      source: 'teamMapForm',
      person: personId,
      title: leadTitle(`Fake Company ${TAG} one`, 'consultancy'),
      lastActivityAt: receivedAt.toISOString(),
    })
    expect(lead.touchedAt ?? null).toBeNull()
    organisationId = lead.organisation as number

    const organisation = await payload.findByID({
      collection: 'organisations',
      id: organisationId,
      depth: 0,
    })
    expect(organisation).toMatchObject({
      name: `Fake Company ${TAG} one`,
      type: 'business',
      domain: domain('one'),
      teamSizeBand: 'from11to50',
    })
    expect(
      (await payload.findByID({ collection: 'people', id: personId, depth: 0 })).organisation,
    ).toBe(organisationId)

    const enquiry = await payload.findByID({ collection: 'enquiries', id: enquiryId, depth: 0 })
    expect(enquiry).toMatchObject({
      kind: 'teamMap',
      status: 'received',
      outcome: 'newLead',
      person: personId,
      organisation: organisationId,
      lead: leadId,
      consents: [consent.id],
      turnstile: 'off',
      submitted: { email: email('one'), organisationName: `Fake Company ${TAG} one` },
    })
    expect(enquiry.conflict ?? null).toBeNull()

    const entries = await payload.find({
      collection: 'lead-activities',
      where: { lead: { equals: leadId } },
      depth: 0,
    })
    expect(entries.docs).toHaveLength(1)
    expect(entries.docs[0]).toMatchObject({ type: 'enquiry', enquiry: enquiryId })
    expect(entries.docs[0]!.by ?? null).toBeNull()

    const tasks = await payload.find({
      collection: 'tasks',
      where: { lead: { equals: leadId } },
      depth: 0,
    })
    expect(tasks.docs).toHaveLength(1)
    const task = tasks.docs[0]!
    expect(task).toMatchObject({
      kind: 'firstReply',
      title: 'Reply to the request',
      status: 'open',
      role: 'operator',
      automation: 'P1',
      key: `P1:enquiry:${enquiryId}`,
      dueOn: addWorkingDays(receivedAt, FIRST_REPLY_WORKING_DAYS),
    })

    const mine = events.emitted.filter(
      (event) =>
        ('leadId' in event && event.leadId === leadId) ||
        (event.name === 'task.created' && event.taskId === task.id),
    )
    expect(mine).toEqual([
      { name: 'lead.created', leadId, kind: 'consultancy', source: 'teamMapForm' },
      { name: 'task.created', taskId: task.id },
      { name: 'enquiry.received', enquiryId, leadId, kind: 'teamMap', outcome: 'newLead' },
    ])
  })

  it('adds a repeat from the same email to the open lead, with no second person or task', async () => {
    const again = await receiveEnquiry(await fresh(), {
      kind: 'teamMap',
      fields: teamMap('one', 1, { prompt: 'A second fake message (int.pipeline).' }),
      context: context(),
    })
    expect(again).toMatchObject({ ok: true, value: { leadId, outcome: 'existingLead' } })
    expect(await count('people', { email: { equals: email('one') } })).toBe(1)
    expect(await count('organisations', { domain: { equals: domain('one') } })).toBe(1)
    expect(await count('enquiries', { lead: { equals: leadId } })).toBe(2)
    expect(await count('tasks', { lead: { equals: leadId } })).toBe(1)
    expect(
      await count('lead-activities', {
        and: [{ lead: { equals: leadId } }, { type: { equals: 'enquiry' } }],
      }),
    ).toBe(2)
  })

  it('adds a colleague from the same work domain to the open lead, as a person of their own', async () => {
    const colleague = await receiveEnquiry(await fresh(), {
      kind: 'teamMap',
      fields: teamMap('colleague', 2, {
        company: `Fake Co ${TAG} spelt another way`,
        website: undefined,
        email: email('colleague', 'one'),
      }),
      context: context(),
    })
    expect(colleague).toMatchObject({ ok: true, value: { leadId, outcome: 'existingLead' } })
    const people = await payload.find({
      collection: 'people',
      where: { email: { equals: email('colleague', 'one') } },
      depth: 0,
    })
    expect(people.docs).toHaveLength(1)
    expect(people.docs[0]!.organisation).toBe(organisationId)
    expect(await count('organisations', { name: { like: `${TAG} spelt another way` } })).toBe(0)
    expect(await count('tasks', { lead: { equals: leadId } })).toBe(1)
  })

  it('links the person the email names when the mobile names another, and says so', async () => {
    const mixed = await receiveEnquiry(await fresh(), {
      kind: 'teamMap',
      fields: teamMap('colleague', 1, { email: email('colleague', 'one'), website: undefined }),
      context: context(),
    })
    expect(mixed.ok).toBe(true)
    if (!mixed.ok) return
    const enquiry = await payload.findByID({
      collection: 'enquiries',
      id: mixed.value.enquiryId,
      depth: 0,
    })
    expect(enquiry.conflict).toBe('emailAndMobileDiffer')
    expect(enquiry.person).not.toBe(personId)
    expect(enquiry.lead).toBe(leadId)
    // The person matched by the mobile is linked to nothing new and left as they were.
    expect((await payload.findByID({ collection: 'people', id: personId, depth: 0 })).email).toBe(
      email('one'),
    )
  })

  it('erases a person’s enquiries and their link to the lead, and keeps the lead (docs/17 §9)', async () => {
    expect(await count('enquiries', { person: { equals: personId } })).toBe(2)
    await payload.delete({ collection: 'people', id: personId })
    expect(await count('enquiries', { person: { equals: personId } })).toBe(0)
    const lead = await leadDoc(leadId)
    expect(lead.person ?? null).toBeNull()
    expect(lead.stage).toBe('new')
    // The colleague's own requests stay on the lead.
    expect(await count('enquiries', { lead: { equals: leadId } })).toBe(2)
  })
})

describe('a partnership enquiry, and spam (P7; docs/17 §4)', () => {
  it('puts a partnership enquiry on the partnership board with an institution', async () => {
    const result = await receiveEnquiry(await fresh(), {
      kind: 'partnership',
      fields: partnership('partner', 3),
      context: { ...context(), page: '/institute' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const lead = await leadDoc(result.value.leadId)
    expect(lead).toMatchObject({ kind: 'partnership', stage: 'new', source: 'partnershipForm' })
    const organisation = await payload.findByID({
      collection: 'organisations',
      id: lead.organisation as number,
      depth: 0,
    })
    expect(organisation.type).toBe('institution')
    const tasks = await payload.find({
      collection: 'tasks',
      where: { lead: { equals: lead.id } },
      depth: 0,
    })
    expect(tasks.docs).toHaveLength(1)
    expect(tasks.docs[0]).toMatchObject({
      automation: 'P7',
      key: `P7:enquiry:${result.value.enquiryId}`,
      role: 'operator',
    })
  })

  it('ends the lead a spam enquiry made, with the reason Spam, and keeps the enquiry', async () => {
    const result = await receiveEnquiry(await fresh(), {
      kind: 'partnership',
      fields: partnership('spam', 4),
      context: context(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { enquiryId, leadId } = result.value
    await payload.update({ collection: 'enquiries', id: enquiryId, data: { status: 'spam' } })
    const lead = await leadDoc(leadId)
    expect(lead).toMatchObject({ stage: 'closed', endReason: SPAM_REASON })
    expect(lead.closedAt).toBeTruthy()
    const moves = await payload.find({
      collection: 'lead-activities',
      where: { and: [{ lead: { equals: leadId } }, { type: { equals: 'stageChange' } }] },
      depth: 0,
    })
    expect(moves.docs).toHaveLength(1)
    expect(moves.docs[0]).toMatchObject({ fromStage: 'new', toStage: 'closed', body: SPAM_REASON })
    expect(
      events.emitted.some((event) => event.name === 'lead.stageChanged' && event.leadId === leadId),
    ).toBe(true)
    const enquiry = await payload.findByID({ collection: 'enquiries', id: enquiryId, depth: 0 })
    expect(enquiry.status).toBe('spam')
  })
})

describe('what stores nothing (docs/17 §4)', () => {
  it('refuses a form that showed a notice no longer in force, and stores nothing', async () => {
    const shown = notice
    // A newer text takes effect: the form that showed the older one asks again.
    notice = await enquiryNotice(new Date(Date.now() - 1000))
    const answer = await receiveEnquiry(await fresh(), {
      kind: 'teamMap',
      fields: teamMap('stale', 5, { noticeVersion: shown.id }),
      context: context(),
    })
    expect(answer).toEqual({ ok: false, error: { code: 'notice-changed' } })
    expect(await leftBy('stale')).toEqual(NOTHING)
  })

  it('leaves nothing behind when a step fails part-way', async () => {
    events.failOn = 'enquiry.received'
    try {
      await expect(
        receiveEnquiry(await fresh(), {
          kind: 'teamMap',
          fields: teamMap('broken', 6),
          context: context(),
        }),
      ).rejects.toThrow('fake failure')
    } finally {
      events.failOn = null
    }
    expect(await leftBy('broken')).toEqual(NOTHING)
  })
})

describe('the alerts job raises each alert once (P3, P4; docs/17 §7)', () => {
  const raised = (name: 'lead.untouched' | 'lead.stale', leadId: number) =>
    events.emitted.filter((event) => event.name === name && event.leadId === leadId)

  it('raises an untouched lead at amber and at red, and one first seen past 48 hours at red only', async () => {
    const early = await requested('waiting', 7)
    const made = new Date((await leadDoc(early)).createdAt).getTime()
    const after = (hours: number) => new Date(made + hours * HOUR)

    await raiseLeadAlerts(await fresh(), after(23))
    expect(raised('lead.untouched', early)).toEqual([])
    await raiseLeadAlerts(await fresh(), after(25))
    await raiseLeadAlerts(await fresh(), after(26))
    expect(raised('lead.untouched', early)).toEqual([
      { name: 'lead.untouched', leadId: early, level: 'amber' },
    ])
    expect((await leadDoc(early)).alerts?.untouched).toBe('amber')

    // Made after the amber pass, so the next pass is the first to see it.
    const late = await requested('late', 8)
    await raiseLeadAlerts(await fresh(), after(49))
    await raiseLeadAlerts(await fresh(), after(50))
    expect(raised('lead.untouched', early)).toEqual([
      { name: 'lead.untouched', leadId: early, level: 'amber' },
      { name: 'lead.untouched', leadId: early, level: 'red' },
    ])
    expect(raised('lead.untouched', late)).toEqual([
      { name: 'lead.untouched', leadId: late, level: 'red' },
    ])
    expect((await leadDoc(late)).alerts?.untouched).toBe('red')
  })

  it('raises a stale lead once per quiet spell, and again only after new activity and a new spell', async () => {
    const leadId = await requested('quiet', 9)
    const moved = await applyMove(await fresh(), { leadId, to: 'contacted', by: null })
    expect(moved.ok).toBe(true)
    const quietFrom = new Date((await leadDoc(leadId)).lastActivityAt as string)
    const after = (days: number, hours = 0) =>
      new Date(quietFrom.getTime() + days * DAY + hours * HOUR)

    await raiseLeadAlerts(await fresh(), after(6, 23))
    expect(raised('lead.stale', leadId)).toEqual([])
    await raiseLeadAlerts(await fresh(), after(7))
    await raiseLeadAlerts(await fresh(), after(7, 1))
    const first = { name: 'lead.stale', leadId, since: quietFrom.toISOString() }
    expect(raised('lead.stale', leadId)).toEqual([first])
    expect((await leadDoc(leadId)).alerts?.staleFor).toBe(quietFrom.toISOString())

    // New activity a day later starts a new spell: nothing until it, too, is seven days old.
    const logged = await logActivity(await fresh(), {
      leadId,
      type: 'note',
      body: 'A fake note (int.pipeline).',
      at: after(8),
      by: null,
    })
    expect(logged.ok).toBe(true)
    await raiseLeadAlerts(await fresh(), after(8, 1))
    expect(raised('lead.stale', leadId)).toEqual([first])
    await raiseLeadAlerts(await fresh(), after(15))
    await raiseLeadAlerts(await fresh(), after(15, 1))
    expect(raised('lead.stale', leadId)).toEqual([
      first,
      { name: 'lead.stale', leadId, since: after(8).toISOString() },
    ])
    expect((await leadDoc(leadId)).alerts?.staleFor).toBe(after(8).toISOString())
  })
})

describe('a proposal call booked puts its lead on the board, once (P2; docs/17 §3)', () => {
  it('makes the organisation and the lead, attaches the call, logs it and moves to Contacted', async () => {
    const service = (await payload.create({
      collection: 'services',
      data: {
        name: `Fake call ${TAG}`,
        type: 'call',
        slug: `int-pipeline-call-${RUN}`,
        register: 'consultancy',
        format: 'online',
        active: true,
        options: [{ label: 'Fake 30', duration: 30 }],
      } as Service,
    })) as Service
    const caller = (await payload.create({
      collection: 'people',
      data: {
        fullName: `Fake Person ${TAG} caller`,
        email: email('caller'),
        mobile: mobile(0),
      } as Person,
    })) as Person
    // A call far ahead, with no practitioner's time taken: only its kind and details matter here.
    const booking = (await payload.create({
      collection: 'bookings',
      data: {
        type: 'call',
        status: 'confirmed',
        paymentStatus: 'notRequired',
        service: service.id,
        durationMinutes: 30,
        person: caller.id,
        startsAt: '2099-04-06T05:00:00.000Z',
        endsAt: '2099-04-06T05:30:00.000Z',
        company: { name: `Fake Company ${TAG} caller`, sector: 'Fake sector' },
      } as Booking,
    })) as Booking

    const first = await attachCall(await fresh(), { bookingId: booking.id })
    expect(first).toMatchObject({ ok: true, value: { created: true } })
    if (!first.ok) return
    const { leadId } = first.value
    const again = await attachCall(await fresh(), { bookingId: booking.id })
    expect(again).toEqual({ ok: true, value: { leadId, created: false } })

    const lead = await leadDoc(leadId)
    expect(lead).toMatchObject({
      kind: 'consultancy',
      stage: 'contacted',
      source: 'proposalCall',
      person: caller.id,
      calls: [booking.id],
    })
    const organisation = await payload.findByID({
      collection: 'organisations',
      id: lead.organisation as number,
      depth: 0,
    })
    expect(organisation).toMatchObject({
      name: `Fake Company ${TAG} caller`,
      type: 'business',
      domain: domain('caller'),
    })
    expect(
      await count('lead-activities', {
        and: [{ lead: { equals: leadId } }, { type: { equals: 'booking' } }],
      }),
    ).toBe(1)
    expect(
      await count('lead-activities', {
        and: [{ lead: { equals: leadId } }, { type: { equals: 'stageChange' } }],
      }),
    ).toBe(1)
  })
})
