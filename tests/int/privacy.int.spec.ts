import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Secret, TOTP } from 'otpauth'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type {
  Booking,
  DataRequest,
  Incident,
  Person,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const { notesWith } = await import('@/lib/notes/notes')
const { loadKeyring } = await import('@/lib/notes/keys')
const { recordAudit } = await import('@/lib/audit/record')
const { planErasure, confirmErasureWith, ERASED_NAME, PLAN_LINES } =
  await import('@/lib/privacy/erasure')
const { exportPersonDataWith, downloadExportWith } = await import('@/lib/privacy/export')
const { folderStore } = await import('@/lib/privacy/store')
const { enterCodeAgain } = await import('@/lib/privacy/stepUp')

// Privacy requests against the real database (docs/18 Â§5, Â§9): the clocks set on create and never
// moved, the moves checked on every save, an erasure that deletes and keeps what its plan said in
// one transaction and only after an owner enters the code again, and the access export without
// session notes. Fake staff, people, words, keys and codes only.

let payload: Payload
const TAG = 'int.privacy'
const PASSWORD = 'test-only-password-privacy'
const WORDS = 'Fake session words int.privacy, never real.'
const KEY = Buffer.alloc(32, 31).toString('base64')
const OWNER_SECRET = new Secret({ size: 20 }).base32

const notes = notesWith({
  keyring: () => loadKeyring({ NOTES_ENCRYPTION_KEY: KEY }),
  audit: recordAudit,
})

type Staff = 'owner' | 'operator' | 'author'
const staff = {} as Record<Staff, User>
let service: Service
let profile: Practitioner
let storeRoot: string
const personIds: number[] = []
const bookingIds: number[] = []
const requestIds: number[] = []
let keys = 0

const confirmErasure = confirmErasureWith(() => folderStore(storeRoot))

const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const reqAs = (who: Staff) => createLocalReq({ user: verified(staff[who]) }, payload)
const ownerCode = () =>
  new TOTP({
    secret: Secret.fromBase32(OWNER_SECRET),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  }).generate()

const user = (label: Staff, roles: User['roles'], extra: Record<string, unknown> = {}) =>
  payload.create({
    collection: 'users',
    data: {
      name: `Fake ${label}`,
      email: `${TAG}.${label}@example.invalid`,
      password: PASSWORD,
      roles,
      ...extra,
    } as User,
  })

async function removeTestData() {
  const people = await payload.find({
    collection: 'people',
    where: { fullName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const everyone = [...new Set([...personIds, ...people.docs.map((person) => person.id)])]
  if (everyone.length) {
    const bookings = await payload.find({
      collection: 'bookings',
      where: { person: { in: everyone } },
      pagination: false,
      depth: 0,
    })
    const ids = [...new Set([...bookingIds, ...bookings.docs.map((booking) => booking.id)])]
    await removeQueuedJobs(payload, { bookingIds: ids })
    await payload.delete({ collection: 'session-notes', where: { person: { in: everyone } } })
    await payload.delete({ collection: 'feedback', where: { person: { in: everyone } } })
    // Recording a request queues M6's O4 or O7 (src/lib/automations/privacy/hooks.ts).
    const requests = await payload.find({
      collection: 'data-requests',
      where: { person: { in: everyone } },
      pagination: false,
      depth: 0,
    })
    await removeQueuedJobs(payload, { dataRequestIds: requests.docs.map((doc) => doc.id) })
    await payload.delete({ collection: 'data-requests', where: { person: { in: everyone } } })
    if (ids.length) await payload.delete({ collection: 'bookings', where: { id: { in: ids } } })
    // The pipeline's records about them, children first: versions, proposals, enquiries, leads.
    const leads = await payload.find({
      collection: 'leads',
      where: { or: [{ person: { in: everyone } }, { title: { like: TAG } }] },
      pagination: false,
      depth: 0,
    })
    const leadIds = leads.docs.map((lead) => lead.id)
    if (leadIds.length) {
      const proposals = await payload.find({
        collection: 'proposals',
        where: { lead: { in: leadIds } },
        pagination: false,
        depth: 0,
      })
      const proposalIds = proposals.docs.map((proposal) => proposal.id)
      if (proposalIds.length) {
        await payload.delete({
          collection: 'proposal-versions',
          where: { proposal: { in: proposalIds } },
        })
        await payload.delete({ collection: 'proposals', where: { id: { in: proposalIds } } })
      }
      await payload.delete({ collection: 'enquiries', where: { lead: { in: leadIds } } })
      await payload.delete({ collection: 'leads', where: { id: { in: leadIds } } })
    }
    await payload.delete({ collection: 'enquiries', where: { person: { in: everyone } } })
    await payload.delete({ collection: 'people', where: { id: { in: everyone } } })
  }
  const suppressions = await payload.find({
    collection: 'suppressions',
    where: { address: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  await removeQueuedJobs(payload, { suppressionIds: suppressions.docs.map((doc) => doc.id) })
  await payload.delete({ collection: 'suppressions', where: { address: { like: TAG } } })
  await payload.delete({ collection: 'subscribers', where: { email: { like: TAG } } })
  await payload.delete({ collection: 'organisations', where: { name: { like: TAG } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-privacy' } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

async function newPerson(label: string) {
  const person = await payload.create({
    collection: 'people',
    data: {
      fullName: `Fake ${label} ${TAG}`,
      email: `${label}.${TAG}@example.invalid`,
      mobile: '+919999900001',
      city: 'Fake City',
    } as Person,
  })
  personIds.push(person.id)
  return person
}

async function newBooking(person: Person) {
  const booking = await payload.create({
    collection: 'bookings',
    data: {
      reference: `IP-${Date.now().toString(36)}-${++keys}`,
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'notRequired',
      service: service.id,
      durationMinutes: 30,
      person: person.id,
      practitioner: profile.id,
      startsAt: new Date(`2099-06-0${keys}T10:00:00+05:30`).toISOString(),
      endsAt: new Date(`2099-06-0${keys}T10:30:00+05:30`).toISOString(),
      timeRequest: { note: `Fake note typed by the person ${TAG}` },
    } as Booking,
  })
  bookingIds.push(booking.id)
  return booking
}

/** A request recorded by the operator through the API, as the Payload form records it. */
async function record(person: Person, type: DataRequest['type']) {
  const request = await payload.create({
    collection: 'data-requests',
    data: {
      type,
      person: person.id,
      channel: 'email',
      // A time that has passed: a time received ahead of now is refused (it would push the clocks).
      receivedAt: '2026-01-31T04:30:00.000Z',
      summary: `Fake request ${TAG}`,
      // A typed deadline or state is not the operator's to set.
      resolveBy: '2199-01-01T00:00:00.000Z',
      status: 'closed',
    } as DataRequest,
    user: verified(staff.operator),
    overrideAccess: false,
  })
  requestIds.push(request.id)
  return request
}

const move = (id: number, data: Partial<DataRequest>) =>
  payload.update({
    collection: 'data-requests',
    id,
    data,
    user: verified(staff.operator),
    overrideAccess: false,
  })

/** received â†’ acknowledged â†’ verified â†’ preparing, as the operator does it. */
async function prepare(id: number) {
  await move(id, { status: 'acknowledged' })
  await move(id, {
    status: 'verified',
    verifiedAt: '2026-02-01T04:30:00.000Z',
    verificationMethod: 'oneTimeCode',
  })
  return move(id, { status: 'preparing' })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  storeRoot = await mkdtemp(path.join(tmpdir(), 'iiic-private-store-'))
  staff.owner = await user('owner', ['owner'], { totpSecret: OWNER_SECRET, hasTotp: true })
  staff.operator = await user('operator', ['operator'])
  staff.author = await user('author', ['practitioner'])
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-privacy-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
    } as Service,
  })
  profile = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG}`, active: true, staff: staff.author.id } as Practitioner,
  })
})

afterAll(async () => {
  vi.restoreAllMocks()
  await removeTestData()
  await rm(storeRoot, { recursive: true, force: true })
})

describe('a requestâ€™s clocks and moves on save', () => {
  it('records it as received, with both clocks from its kind and receipt, whatever was typed', async () => {
    const person = await newPerson('clocks')
    const request = await record(person, 'consumerComplaint')
    expect(request.status).toBe('received')
    expect(request.acknowledgeBy).toBe('2026-02-02T04:30:00.000Z')
    // One calendar month in India: 31 January ends on the last day of February.
    expect(request.resolveBy).toBe('2026-02-28T04:30:00.000Z')
  })

  it('never moves the clocks and refuses a step out of order', async () => {
    const person = await newPerson('moves')
    const request = await record(person, 'access')
    await expect(move(request.id, { receivedAt: '2026-02-15T04:30:00.000Z' })).rejects.toThrow()
    await expect(move(request.id, { status: 'preparing' })).rejects.toThrow()
    await expect(
      move(request.id, { status: 'closed', resolution: { outcome: 'fulfilled' } }),
    ).rejects.toThrow()
    const unchanged = await payload.findByID({ collection: 'data-requests', id: request.id })
    expect(unchanged.status).toBe('received')
    expect(unchanged.resolveBy).toBe(request.resolveBy)
  })

  it('never points a request at another person once recorded', async () => {
    const person = await newPerson('repointed')
    const other = await newPerson('someone-else')
    const request = await record(person, 'erasure')
    await move(request.id, { status: 'acknowledged' })
    await expect(move(request.id, { person: other.id })).rejects.toThrow()
    const kept = await payload.findByID({ collection: 'data-requests', id: request.id, depth: 0 })
    expect(kept.person).toBe(person.id)
  })

  it('sets an incidentâ€™s CERT-In and Board deadlines from its detection', async () => {
    const incident = await payload.create({
      collection: 'incidents',
      data: {
        title: `Fake incident ${TAG}`,
        status: 'open',
        detectedAt: '2026-06-01T17:10:00.000Z',
        description: 'Fake description: a test system, no person named.',
        certIn: { reportable: true },
      } as Incident,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(incident.certIn?.dueAt).toBe('2026-06-01T23:10:00.000Z')
    expect(incident.board?.dueAt).toBe('2026-06-04T17:10:00.000Z')
    await removeQueuedJobs(payload, { incidentIds: [incident.id] })
    await payload.delete({ collection: 'incidents', id: incident.id })
  })
})

describe('an erasure', () => {
  let person: Person
  let booking: Booking
  let request: DataRequest
  let noteId: number
  // What M4 and M6 hold about the person (docs/17 §9; docs/19 §8).
  let leadId: number
  let versionId: number
  let enquiryId: number
  let subscriberId: number
  let suppressionId: number
  let exportKey: string

  beforeAll(async () => {
    person = await newPerson('erased')
    booking = await newBooking(person)
    const organisation = await payload.create({
      collection: 'organisations',
      data: { name: `Fake Org ${TAG}`, type: 'business' },
    })
    await payload.update({
      collection: 'people',
      id: person.id,
      data: {
        organisation: organisation.id,
        jobTitle: 'Fake role',
        whatsappLastInboundAt: new Date().toISOString(),
      },
    })
    const lead = await payload.create({
      collection: 'leads',
      data: {
        kind: 'consultancy',
        stage: 'new',
        source: 'office',
        organisation: organisation.id,
        person: person.id,
      } as never,
    })
    leadId = lead.id
    const proposal = await payload.create({
      collection: 'proposals',
      data: { lead: lead.id, title: `Fake proposal ${TAG}` } as never,
    })
    const version = await payload.create({
      collection: 'proposal-versions',
      data: {
        proposal: proposal.id,
        number: 1,
        document: { title: 'Fake' },
        sending: { sentTo: person.id },
      } as never,
    })
    versionId = version.id
    const enquiry = await payload.create({
      collection: 'enquiries',
      data: {
        kind: 'teamMap',
        receivedAt: new Date().toISOString(),
        submitted: {
          organisationName: `Fake Org ${TAG}`,
          contactName: person.fullName,
          email: person.email,
          message: `Fake words typed in a form ${TAG}`,
        },
        person: person.id,
        lead: lead.id,
      } as never,
    })
    enquiryId = enquiry.id
    const subscriber = await payload.create({
      collection: 'subscribers',
      data: { email: person.email, status: 'confirmed', person: person.id } as never,
    })
    subscriberId = subscriber.id
    const suppression = await payload.create({
      collection: 'suppressions',
      data: {
        channel: 'email',
        address: person.email,
        reason: 'hardBounce',
        person: person.id,
      } as never,
    })
    suppressionId = suppression.id
    await removeQueuedJobs(payload, { suppressionIds: [suppressionId] })
    // An access export made earlier for the same person, in the private store.
    const access = await record(person, 'access')
    exportKey = `privacy-exports/request-${access.id}/export-20260201043000.json`
    await folderStore(storeRoot).put(exportKey, '{"fake":true}', 'application/json')
    await payload.update({ collection: 'data-requests', id: access.id, data: { exportKey } })
    const written = await notes.writeNote(await reqAs('author'), {
      bookingId: booking.id,
      body: WORDS,
    })
    if (!written.ok) throw new Error(`the note was refused: ${written.error.code}`)
    noteId = written.value.id
    await payload.create({
      collection: 'feedback',
      data: {
        booking: booking.id,
        person: person.id,
        rating: 4,
        submittedAt: new Date().toISOString(),
        status: 'new',
        comment: `Fake comment ${TAG}`,
      },
    })
    request = await record(person, 'erasure')
  })

  it('is not planned before the identity check', async () => {
    expect(await planErasure(await reqAs('operator'), request.id)).toEqual({
      ok: false,
      error: { code: 'not-verified' },
    })
  })

  it('shows the owner the notes it deletes, and the operator nothing of notes', async () => {
    await prepare(request.id)
    const forOwner = await planErasure(await reqAs('owner'), request.id)
    if (!forOwner.ok) throw new Error(forOwner.error.code)
    expect(forOwner.value.deletes).toContainEqual({ entity: PLAN_LINES.notes, count: 1 })
    expect(forOwner.value.deletes).toContainEqual({ entity: PLAN_LINES.feedback, count: 1 })
    expect(forOwner.value.keeps).toContainEqual(
      expect.objectContaining({ entity: PLAN_LINES.bookings, count: 1 }),
    )
    for (const [entity, count] of [
      [PLAN_LINES.enquiries, 1],
      [PLAN_LINES.pipelineLinks, 2],
      [PLAN_LINES.subscriber, 1],
      [PLAN_LINES.exports, 1],
    ] as const) {
      expect(forOwner.value.deletes).toContainEqual({ entity, count })
    }
    expect(forOwner.value.keeps).toContainEqual(
      expect.objectContaining({ entity: PLAN_LINES.suppressions, count: 1 }),
    )
    const forOperator = await planErasure(await reqAs('operator'), request.id)
    if (!forOperator.ok) throw new Error(forOperator.error.code)
    expect(forOperator.value.deletes.map((line) => line.entity)).not.toContain(PLAN_LINES.notes)
  })

  it('is confirmed only by an owner, only once it waits for one, and only with the code', async () => {
    const operator = await confirmErasure(await reqAs('operator'), request.id)
    expect(operator).toMatchObject({ ok: false, error: { code: 'refused' } })

    const withoutCode = await confirmErasure(await reqAs('owner'), request.id)
    expect(withoutCode).toMatchObject({
      ok: false,
      error: { code: 'refused', refusal: { code: 'enter-code' } },
    })

    const wrong = await reqAs('owner')
    expect(await enterCodeAgain(wrong, '000000')).toMatchObject({ ok: false })
    expect(await confirmErasure(wrong, request.id)).toMatchObject({ ok: false })

    const early = await reqAs('owner')
    expect(await enterCodeAgain(early, ownerCode())).toEqual({ ok: true, value: true })
    expect(await confirmErasure(early, request.id)).toEqual({
      ok: false,
      error: { code: 'not-now', status: 'preparing' },
    })
    await move(request.id, { status: 'awaitingOwner' })
    // The operator cannot close it as done from the form.
    await expect(
      move(request.id, { status: 'closed', resolution: { outcome: 'fulfilled' } }),
    ).rejects.toThrow()
  })

  it('rolls everything back when one step fails', async () => {
    const original = payload.update.bind(payload)
    const spy = vi.spyOn(payload, 'update').mockImplementation((async (args: {
      collection: string
    }) => {
      if (args.collection === 'data-requests') throw new Error('fake failure for the rollback test')
      return original(args as never)
    }) as never)
    const req = await reqAs('owner')
    await enterCodeAgain(req, ownerCode())
    await expect(confirmErasure(req, request.id)).rejects.toThrow('fake failure')
    spy.mockRestore()

    const kept = await payload.findByID({ collection: 'people', id: person.id })
    expect(kept.fullName).toContain(TAG)
    expect(
      await payload.count({ collection: 'session-notes', where: { id: { equals: noteId } } }),
    ).toEqual({ totalDocs: 1 })
    expect(
      await payload.count({ collection: 'enquiries', where: { id: { equals: enquiryId } } }),
    ).toEqual({ totalDocs: 1 })
    // The export files go last, after every write that can fail.
    expect(await folderStore(storeRoot).get(exportKey)).not.toBeNull()
  })

  it('deletes and keeps what the plan said, in one go, and closes the request', async () => {
    const req = await reqAs('owner')
    await enterCodeAgain(req, ownerCode())
    const done = await confirmErasure(req, request.id)
    // A note, a feedback, an enquiry and a newsletter subscription.
    expect(done).toEqual({ ok: true, value: { deleted: 4 } })

    const where = { person: { equals: person.id } }
    expect((await payload.count({ collection: 'session-notes', where })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'feedback', where })).totalDocs).toBe(0)

    const emptied = await payload.findByID({ collection: 'people', id: person.id, depth: 0 })
    expect(emptied.fullName).toBe(ERASED_NAME)
    expect(emptied.email ?? null).toBeNull()
    expect(emptied.mobile ?? null).toBeNull()
    expect(emptied.city ?? null).toBeNull()
    expect(emptied.organisation ?? null).toBeNull()
    expect(emptied.jobTitle ?? null).toBeNull()
    expect(emptied.whatsappLastInboundAt ?? null).toBeNull()

    // M4 and M6 (docs/17 §9): the enquiry and the subscription go; the lead and the version stay
    // with no link to the person; the suppressed address stays, so nothing is sent to it (D-110).
    expect(
      await payload.count({ collection: 'enquiries', where: { id: { equals: enquiryId } } }),
    ).toEqual({ totalDocs: 0 })
    expect(
      await payload.count({ collection: 'subscribers', where: { id: { equals: subscriberId } } }),
    ).toEqual({ totalDocs: 0 })
    const lead = await payload.findByID({ collection: 'leads', id: leadId, depth: 0 })
    expect(lead.person ?? null).toBeNull()
    const version = await payload.findByID({
      collection: 'proposal-versions',
      id: versionId,
      depth: 0,
    })
    expect(version.sending?.sentTo ?? null).toBeNull()
    const suppression = await payload.findByID({
      collection: 'suppressions',
      id: suppressionId,
      depth: 0,
    })
    expect(suppression.address).toBe(person.email)

    // The access export's file is gone, and its request no longer points at it.
    expect(await folderStore(storeRoot).get(exportKey)).toBeNull()
    expect(
      await payload.count({
        collection: 'data-requests',
        where: { and: [where, { exportKey: { exists: true } }] },
      }),
    ).toEqual({ totalDocs: 0 })

    const keptBooking = await payload.findByID({ collection: 'bookings', id: booking.id, depth: 0 })
    expect(keptBooking.person).toBe(person.id)
    expect(keptBooking.timeRequest?.note ?? null).toBeNull()

    const closed = await payload.findByID({ collection: 'data-requests', id: request.id, depth: 0 })
    expect(closed.status).toBe('closed')
    expect(closed.resolution?.outcome).toBe('fulfilled')
    expect(closed.resolution?.erasureConfirmedAt).toBeTruthy()
    expect(closed.resolution?.decidedBy).toBe(staff.owner.id)
    const entries = await payload.count({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'confirm-erasure' } },
          { entityId: { equals: String(request.id) } },
        ],
      },
    })
    expect(entries.totalDocs).toBe(1)
  })
})

describe('an access export', () => {
  const store = () => folderStore(storeRoot)
  const exportWith = exportPersonDataWith(store)
  let person: Person
  let request: DataRequest

  beforeAll(async () => {
    person = await newPerson('exported')
    const booking = await newBooking(person)
    const written = await notes.writeNote(await reqAs('author'), {
      bookingId: booking.id,
      body: WORDS,
    })
    if (!written.ok) throw new Error(`the note was refused: ${written.error.code}`)
    request = await record(person, 'access')
  })

  it('waits for the identity check, and is an ownerâ€™s with the code', async () => {
    const early = await reqAs('owner')
    await enterCodeAgain(early, ownerCode())
    expect(await exportWith(early, request.id)).toEqual({
      ok: false,
      error: { code: 'not-verified' },
    })
    await prepare(request.id)
    expect(await exportWith(await reqAs('operator'), request.id)).toMatchObject({
      ok: false,
      error: { code: 'refused' },
    })
    expect(await exportWith(await reqAs('owner'), request.id)).toMatchObject({
      ok: false,
      error: { code: 'refused', refusal: { code: 'enter-code' } },
    })
  })

  it('holds the personâ€™s own records and never a session note, and each download is audited', async () => {
    const req = await reqAs('owner')
    await enterCodeAgain(req, ownerCode())
    const made = await exportWith(req, request.id)
    if (!made.ok) throw new Error(made.error.code)
    const saved = await payload.findByID({ collection: 'data-requests', id: request.id })
    expect(saved.exportKey).toBe(made.value.key)

    const file = await downloadExportWith(store, await reqAs('owner'), request.id, 'json')
    if (!file.ok) throw new Error(file.error.code)
    const text = file.value.body.toString('utf8')
    expect(text).toContain(person.fullName)
    expect(text).not.toContain('Fake session words')
    expect(text).not.toContain('sealed')

    const page = await downloadExportWith(store, await reqAs('owner'), request.id, 'html')
    if (!page.ok) throw new Error(page.error.code)
    expect(page.value.body.toString('utf8')).toContain('<h1>Your data held by IIIC</h1>')

    const downloads = await payload.count({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'download-export' } },
          { entityId: { equals: String(request.id) } },
        ],
      },
    })
    expect(downloads.totalDocs).toBe(2)
    expect(
      await downloadExportWith(store, await reqAs('operator'), request.id, 'json'),
    ).toMatchObject({ ok: false, error: { code: 'refused' } })
  })
})
