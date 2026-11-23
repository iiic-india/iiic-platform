import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { PipelineEvent } from '@/lib/pipeline/events'
import { PROPOSAL_EMAIL } from '@/lib/pipeline/proposal/copy'
import type { ProposalDeps } from '@/lib/pipeline/proposal/deps'
import {
  interimAddWorkingDays,
  interimCreateTask,
  interimLogActivity,
  interimMoveLead,
} from '@/lib/pipeline/proposal/interim'
import { fakeProposalPrinter, rupees } from '@/lib/pipeline/proposal/print'
import { makeProposals } from '@/lib/pipeline/proposal/service'
import { hashLinkToken } from '@/lib/pipeline/proposal/tokens'
import type { ProposalMailer } from '@/lib/pipeline/proposals'
import { ok } from '@/lib/result'
import type { Lead, Organisation, Person, Proposal, User } from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

// A proposal generated, previewed, sent and tracked against the real Postgres (docs/17 §5, §11):
// the reference and the server's total, owners alone changing fees, a version freezing the copy,
// `incomplete` naming the empty parts, the preview holding every merge value, the fees rule
// refusing the preview and the PDF while prices are hidden, the send recording the copy's hash
// and only the link's hash, the follow-up task in three working days, the lead at Proposal sent
// and an email with no amount, the PDF's opening counted and the first moving the proposal to
// viewed once, replaced, withdrawn and declined links closing alike, and P8 expiring a proposal
// past its day. The printer and the mailer are fakes, the fees obviously fake, and the clock a
// Friday evening in India. Everything is removed at the end.

let payload: Payload
const TAG = 'int.proposals'
const staff = {} as Record<'owner' | 'operator' | 'finance', User>
let organisation: Organisation
let person: Person
let lead: Lead
let proposal: Proposal

// Friday 20 November 2026, 6 PM in India.
const clock = { now: new Date('2026-11-20T12:30:00.000Z') }
const flags = { pricesPublic: true }
const emitted: PipelineEvent[] = []
const mailed: Parameters<ProposalMailer>[0][] = []

const deps: ProposalDeps = {
  printer: fakeProposalPrinter(),
  mailerFor: () => async (message) => {
    mailed.push(message)
    return ok({ messageId: null })
  },
  emit: async (_req, event) => {
    emitted.push(event)
  },
  logActivity: interimLogActivity,
  createTask: interimCreateTask,
  moveLead: interimMoveLead,
  addWorkingDays: interimAddWorkingDays,
  readFlags: async () => ({ ...flags }),
  siteUrl: 'http://localhost:3000',
  now: () => clock.now,
}
const proposals = makeProposals(deps)

const fresh = (): Promise<PayloadRequest> => createLocalReq({}, payload)
const as = (user: User): Promise<PayloadRequest> =>
  createLocalReq({ user: { ...user, collection: 'users', _strategy: 'totp' } as User }, payload)

const FEES = [
  { item: 'Fake phase one fee', amountPaise: 12_345_650 },
  { item: 'Fake phase two fee', amountPaise: 5_000_000 },
]

const tokenOf = (linkUrl: string) => new URL(linkUrl).pathname.split('/').pop() ?? ''

const named = (name: PipelineEvent['name']) => emitted.filter((event) => event.name === name)

/** The `proposal.expired` events for one proposal. */
const expiredEvents = (proposalId: number) =>
  emitted.filter((event) => event.name === 'proposal.expired' && event.proposalId === proposalId)

async function removeTestData() {
  const { docs: leads } = await payload.find({
    collection: 'leads',
    where: { nextAction: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const leadIds = leads.map((found) => found.id)
  if (leadIds.length) {
    const { docs: made } = await payload.find({
      collection: 'proposals',
      where: { lead: { in: leadIds } },
      pagination: false,
      depth: 0,
    })
    const proposalIds = made.map((found) => found.id)
    if (proposalIds.length) {
      await payload.update({
        collection: 'proposals',
        where: { id: { in: proposalIds } },
        data: { currentVersion: null, sentVersion: null },
      })
      await payload.delete({
        collection: 'lead-activities',
        where: { lead: { in: leadIds } },
      })
      await payload.delete({
        collection: 'proposal-versions',
        where: { proposal: { in: proposalIds } },
      })
      await payload.delete({ collection: 'proposals', where: { id: { in: proposalIds } } })
    }
    await payload.delete({ collection: 'tasks', where: { lead: { in: leadIds } } })
    await payload.delete({ collection: 'lead-activities', where: { lead: { in: leadIds } } })
    await payload.delete({ collection: 'leads', where: { id: { in: leadIds } } })
  }
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'organisations', where: { name: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A complete working copy, every part typed (obviously fake). */
function parts(title: string): Partial<Proposal> {
  return {
    title,
    subtitle: 'A fake subtitle for the test',
    preparedByName: 'Fake Preparer',
    preparedByTitle: 'Fake title',
    situation: 'A fake situation.',
    approach: 'A fake approach.',
    phases: [
      {
        name: 'Fake phase',
        duration: 'Four weeks',
        what: 'Fake work happens.',
        outcome: 'A fake outcome.',
      },
    ],
    measures: 'Fake measures.',
    fees: FEES,
    nextStep: 'A fake next step.',
  }
}

async function makeLead(stage: Lead['stage'] = 'teamMapDone'): Promise<Lead> {
  return payload.create({
    collection: 'leads',
    data: {
      kind: 'consultancy',
      stage,
      source: 'office',
      organisation: organisation.id,
      person: person.id,
      nextAction: `Fake next action ${TAG}`,
    } as Lead,
  })
}

async function makeProposal(forLead: Lead, data: Partial<Proposal>): Promise<Proposal> {
  return payload.create({
    collection: 'proposals',
    data: { lead: forLead.id, title: 'Untitled fake', ...data } as Proposal,
  })
}

const reread = (id: number) => payload.findByID({ collection: 'proposals', id, depth: 0 })
const version = (id: number) =>
  payload.findByID({ collection: 'proposal-versions', id, depth: 0, showHiddenFields: true })

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  for (const role of ['owner', 'operator', 'finance'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role}`,
        email: `${TAG}.${role}@example.invalid`,
        password: 'test-only-password-proposals',
        roles: [role],
      },
    })
  }
  organisation = await payload.create({
    collection: 'organisations',
    data: { name: `Fake Org ${TAG}`, type: 'business' } as Organisation,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Client ${TAG}`, email: `${TAG}.client@example.invalid` } as Person,
  })
  lead = await makeLead()
  proposal = await makeProposal(lead, parts('Fake proposal for the test'))
})

afterAll(async () => {
  await removeTestData()
})

describe('a proposal’s working copy', () => {
  it('gets a reference and the total from the server', () => {
    expect(proposal.reference).toMatch(/^IIIC-P-\d{5}$/)
    expect(proposal.feeTotalPaise).toBe(17_345_650)
    expect(proposal.status).toBe('draft')
  })

  it('takes fees from an owner only', async () => {
    const changed = [{ item: 'Fake changed fee', amountPaise: 100 }]
    await payload.update({
      collection: 'proposals',
      id: proposal.id,
      data: { fees: changed },
      overrideAccess: false,
      req: await as(staff.operator),
    })
    expect((await reread(proposal.id)).fees?.map((fee) => fee.amountPaise)).toEqual([
      12_345_650, 5_000_000,
    ])
    await payload.update({
      collection: 'proposals',
      id: proposal.id,
      data: { fees: changed },
      overrideAccess: false,
      req: await as(staff.owner),
    })
    const after = await reread(proposal.id)
    expect(after.feeTotalPaise).toBe(100)
    // Back to the fees the rest of the file prints.
    await payload.update({ collection: 'proposals', id: proposal.id, data: { fees: FEES } })
    expect((await reread(proposal.id)).feeTotalPaise).toBe(17_345_650)
  })

  it('names the empty parts when a version cannot be made yet', async () => {
    const thin = await makeProposal(lead, { title: 'Fake thin proposal' })
    const made = await proposals.createVersion(await as(staff.operator), { proposalId: thin.id })
    expect(made.ok).toBe(false)
    if (made.ok || made.error.code !== 'incomplete') throw new Error('expected incomplete')
    expect(made.error.missing).toEqual(
      expect.arrayContaining(['situation', 'approach', 'phases', 'fees', 'nextStep']),
    )
    // The office's preview shows each empty part as a placeholder with its name.
    const preview = await proposals.preview(await as(staff.finance), { proposalId: thin.id })
    if (!preview.ok) throw new Error(preview.error.code)
    expect(preview.value.html).toContain('[[TODO: the situation, not typed yet]]')
  })

  it('refuses the readers who are not staff of the pipeline, and finance cannot act', async () => {
    const asFinance = await proposals.createVersion(await as(staff.finance), {
      proposalId: proposal.id,
    })
    expect(asFinance).toMatchObject({ ok: false, error: { code: 'not-allowed' } })
    const anonymous = await proposals.preview(await fresh(), { proposalId: proposal.id })
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'not-allowed' } })
  })
})

describe('generated, previewed, sent and tracked', () => {
  let first: number
  let firstLink: string

  it('freezes the working copy and its total as version 1', async () => {
    const made = await proposals.createVersion(await as(staff.operator), {
      proposalId: proposal.id,
    })
    if (!made.ok) throw new Error(made.error.code)
    first = made.value.id
    expect(made.value.number).toBe(1)
    expect(made.value.feeTotalPaise).toBe(17_345_650)
    expect(made.value.document).toMatchObject({
      clientName: organisation.name,
      title: 'Fake proposal for the test',
      reference: `${proposal.reference} v1`,
      date: '2026-11-20',
      fees: FEES,
    })
    expect((await reread(proposal.id)).currentVersion).toBe(first)
    expect(named('proposal.versionCreated')).toHaveLength(1)

    // A later edit of the working copy leaves the version as it was frozen.
    await payload.update({
      collection: 'proposals',
      id: proposal.id,
      data: { situation: 'A changed fake situation.' },
    })
    expect((await version(first)).document).toMatchObject({ situation: 'A fake situation.' })
  })

  it('previews with every merge value, and prints a PDF', async () => {
    const preview = await proposals.preview(await as(staff.finance), { versionId: first })
    if (!preview.ok) throw new Error(preview.error.code)
    for (const value of [
      'Fake proposal for the test',
      'A fake subtitle for the test',
      `Prepared for ${organisation.name}`,
      `${proposal.reference} v1`,
      'Fake Preparer',
      'A fake situation.',
      'A fake approach.',
      'Fake phase',
      'Fake measures.',
      `Fake phase one fee: ${rupees(12_345_650)}`,
      `Total, excluding GST: ${rupees(17_345_650)}`,
      'A fake next step.',
    ]) {
      expect(preview.value.html, value).toContain(value)
    }
    const printed = await proposals.print(await as(staff.finance), { versionId: first })
    if (!printed.ok) throw new Error(printed.error.code)
    expect(new TextDecoder().decode(printed.value.pdf.slice(0, 5))).toBe('%PDF-')
    expect(printed.value.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses the preview, the PDF and the send while prices are hidden', async () => {
    flags.pricesPublic = false
    try {
      const req = await as(staff.operator)
      expect(await proposals.preview(req, { versionId: first })).toMatchObject({
        ok: false,
        error: { code: 'fees-hidden' },
      })
      expect(await proposals.print(await as(staff.operator), { versionId: first })).toMatchObject({
        ok: false,
        error: { code: 'fees-hidden' },
      })
      const sent = await proposals.send(await as(staff.operator), {
        versionId: first,
        by: staff.operator.id,
      })
      expect(sent).toMatchObject({ ok: false, error: { code: 'fees-hidden' } })
      expect((await version(first)).sending?.sentAt).toBeFalsy()
      expect(mailed).toHaveLength(0)
      expect((await reread(proposal.id)).status).toBe('draft')
    } finally {
      flags.pricesPublic = true
    }
  })

  it('sends: the hash, the link’s hash only, the task, the lead, the event, an email with no amount', async () => {
    const sent = await proposals.send(await as(staff.operator), {
      versionId: first,
      by: staff.operator.id,
    })
    if (!sent.ok) throw new Error(sent.error.code)
    firstLink = sent.value.linkUrl
    expect(sent.value.mailed).toBe(true)
    const token = tokenOf(firstLink)
    expect(firstLink).toBe(`http://localhost:3000/p/${token}`)

    const stored = await version(first)
    expect(stored.linkTokenHash).toBe(hashLinkToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(stored.pdf?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.sending?.sentAt).toBe(clock.now.toISOString())
    expect(stored.sending?.emailedAt).toBeTruthy()
    expect(stored.sending?.sentTo).toBe(person.id)

    const after = await reread(proposal.id)
    expect(after.status).toBe('sent')
    expect(after.sentVersion).toBe(first)
    expect((await payload.findByID({ collection: 'leads', id: lead.id, depth: 0 })).stage).toBe(
      'proposalSent',
    )

    const { docs: tasks } = await payload.find({
      collection: 'tasks',
      where: { key: { equals: `P5:version:${first}` } },
      depth: 0,
    })
    expect(tasks).toHaveLength(1)
    // Friday evening plus three working days: Wednesday.
    expect(tasks[0]).toMatchObject({ kind: 'proposalFollowUp', dueOn: '2026-11-25', status: 'open' })
    expect(named('proposal.sent')).toEqual([
      { name: 'proposal.sent', proposalId: proposal.id, versionId: first },
    ])

    expect(mailed).toHaveLength(1)
    const message = mailed[0]
    expect(message).toMatchObject({
      to: person.email,
      reference: `${proposal.reference} v1`,
      clientName: organisation.name,
      linkUrl: firstLink,
    })
    if (!message) throw new Error('no email')
    const words = `${PROPOSAL_EMAIL.subject(message.reference)}\n${PROPOSAL_EMAIL.text(message)}`
    expect(words).not.toMatch(/₹|Rs\.|rupee/i)
    for (const fee of FEES) expect(words).not.toContain(rupees(fee.amountPaise))
  })

  it('counts an opening of the PDF, not of the page, and moves to viewed once', async () => {
    const token = tokenOf(firstLink)
    const page = await proposals.read(await fresh(), token)
    expect(page).toMatchObject({
      ok: true,
      value: { title: 'Fake proposal for the test', clientName: organisation.name },
    })
    expect((await version(first)).tracking?.viewCount ?? 0).toBe(0)
    expect((await reread(proposal.id)).status).toBe('sent')

    const opened = await proposals.open(await fresh(), { token, now: clock.now })
    if (!opened.ok) throw new Error(opened.error.code)
    expect(new TextDecoder().decode(opened.value.pdf.slice(0, 5))).toBe('%PDF-')
    const again = await proposals.open(await fresh(), { token, now: clock.now })
    expect(again.ok).toBe(true)

    const tracked = await version(first)
    expect(tracked.tracking?.viewCount).toBe(2)
    expect(tracked.tracking?.firstViewedAt).toBeTruthy()
    expect((await reread(proposal.id)).status).toBe('viewed')
    expect(named('proposal.viewed')).toHaveLength(1)
  })

  it('closes a replaced link once the next version is sent, and a withdrawn one', async () => {
    const made = await proposals.createVersion(await as(staff.owner), { proposalId: proposal.id })
    if (!made.ok) throw new Error(made.error.code)
    expect((await reread(proposal.id)).status).toBe('draft')
    // While the office revises, the client's link still opens.
    expect((await proposals.read(await fresh(), tokenOf(firstLink))).ok).toBe(true)
    // An older version is never sent.
    const old = await proposals.send(await as(staff.owner), { versionId: first, by: staff.owner.id })
    expect(old).toMatchObject({ ok: false, error: { code: 'bad-move' } })

    const sent = await proposals.send(await as(staff.owner), {
      versionId: made.value.id,
      by: staff.owner.id,
    })
    if (!sent.ok) throw new Error(sent.error.code)
    const closed = await proposals.open(await fresh(), { token: tokenOf(firstLink), now: clock.now })
    expect(closed).toMatchObject({ ok: false, error: { code: 'link-closed' } })
    expect((await version(first)).sending?.supersededAt).toBeTruthy()
    expect((await proposals.read(await fresh(), tokenOf(sent.value.linkUrl))).ok).toBe(true)

    const withdrawn = await proposals.withdraw(await as(staff.operator), {
      versionId: made.value.id,
    })
    expect(withdrawn.ok).toBe(true)
    expect(await proposals.read(await fresh(), tokenOf(sent.value.linkUrl))).toMatchObject({
      ok: false,
      error: { code: 'link-closed' },
    })

    // Sending again issues a new link, which opens.
    const resent = await proposals.send(await as(staff.owner), {
      versionId: made.value.id,
      by: staff.owner.id,
    })
    if (!resent.ok) throw new Error(resent.error.code)
    expect(resent.value.linkUrl).not.toBe(sent.value.linkUrl)
    expect((await proposals.read(await fresh(), tokenOf(resent.value.linkUrl))).ok).toBe(true)
    firstLink = resent.value.linkUrl
  })

  it('answers an unknown token as a closed link', async () => {
    const unknown = 'A'.repeat(43)
    expect(await proposals.read(await fresh(), unknown)).toMatchObject({
      ok: false,
      error: { code: 'link-closed' },
    })
    expect(await proposals.open(await fresh(), { token: 'short', now: clock.now })).toMatchObject({
      ok: false,
      error: { code: 'link-closed' },
    })
  })

  it('records a decline, which is final and closes the link', async () => {
    const answered = await proposals.answer(await as(staff.operator), {
      proposalId: proposal.id,
      answer: 'declined',
      note: 'Fake note: the budget moved.',
      by: staff.operator.id,
    })
    expect(answered.ok).toBe(true)
    const after = await reread(proposal.id)
    expect(after.status).toBe('declined')
    expect(after.declinedAt).toBeTruthy()
    expect(named('proposal.declined')).toHaveLength(1)
    expect(await proposals.read(await fresh(), tokenOf(firstLink))).toMatchObject({
      ok: false,
      error: { code: 'link-closed' },
    })
    const again = await proposals.createVersion(await as(staff.owner), { proposalId: proposal.id })
    expect(again).toMatchObject({ ok: false, error: { code: 'bad-move' } })
  })
})

describe('P8, expiry', () => {
  it('expires a sent proposal past its last valid day, once', async () => {
    const other = await makeLead('debriefHeld')
    const dated = await makeProposal(other, { ...parts('Fake dated proposal'), validUntil: '2026-11-21' })
    const made = await proposals.createVersion(await as(staff.owner), { proposalId: dated.id })
    if (!made.ok) throw new Error(made.error.code)
    const sent = await proposals.send(await as(staff.owner), {
      versionId: made.value.id,
      by: staff.owner.id,
    })
    if (!sent.ok) throw new Error(sent.error.code)

    // Saturday the 21st is still valid; Monday the 23rd is past it.
    expect(await proposals.expire(await fresh(), new Date('2026-11-21T12:00:00.000Z'))).toBe(0)
    const monday = new Date('2026-11-23T04:00:00.000Z')
    expect(await proposals.expire(await fresh(), monday)).toBeGreaterThanOrEqual(1)
    const after = await reread(dated.id)
    expect(after.status).toBe('expired')
    expect(after.expiredAt).toBe(monday.toISOString())
    expect(expiredEvents(dated.id)).toHaveLength(1)
    // A second run changes nothing, and the link no longer opens.
    await proposals.expire(await fresh(), monday)
    expect(expiredEvents(dated.id)).toHaveLength(1)
    expect(
      await proposals.open(await fresh(), { token: tokenOf(sent.value.linkUrl), now: monday }),
    ).toMatchObject({ ok: false, error: { code: 'link-closed' } })
  })
})
