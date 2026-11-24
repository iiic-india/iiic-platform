import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { loadCalendar } from '@/lib/adminViews/calendar'
import { REPORT_FIGURES, type ScheduleItem } from '@/lib/adminViews/contract'
import { loadProof } from '@/lib/adminViews/proof'
import { loadReports } from '@/lib/adminViews/reports'
import { searchAdmin } from '@/lib/adminViews/search'
import { loadSettings } from '@/lib/adminViews/settings'
import { loadPersonTimeline } from '@/lib/adminViews/timeline'
import { loadToday } from '@/lib/adminViews/today'
import { formatCertificateId } from '@/lib/certificates/ids'
import type {
  Booking,
  CaseStudy,
  Certificate,
  Person,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

// The views of M5 C against the real database (docs/18 §6, §9): what each role sees once it is let
// in. A practitioner's Today, Calendar, person record and search hold their own bookings and
// clients only; the office sees everyone's; Reports and Settings answer owners. Then the rules
// that keep the platform's own fields its own: no role writes a session note or a certificate
// through the API, and only an owner publishes a case study, with the client's approval recorded.
// Obviously fake staff, profiles, people and bookings, on a day no other test uses, removed at the
// end; the mobile number is libphonenumber's own example.

let payload: Payload
const TAG = 'int.adminViews'
const REF = 'INT-AVW-'
const PASSWORD = 'test-only-password-admin-views'
const DAY = '2099-05-14'
/** 11:30 AM in India on that day. */
const NOW = new Date('2099-05-14T06:00:00.000Z')

type Who = 'owner' | 'operator' | 'practitionerA' | 'practitionerB' | 'finance' | 'editor'
const staff = {} as Record<Who, User>
const profile = {} as Record<'mine' | 'theirs', Practitioner>
const client = {} as Record<'mine' | 'theirs', Person>
const booking = {} as Record<'mine' | 'theirs', Booking>
let service: Service

/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const reqAs = (who: Who) => createLocalReq({ user: verified(staff[who]) }, payload)

async function removeTestData() {
  await payload.delete({ collection: 'case-studies', where: { title: { like: TAG } } })
  await payload.delete({ collection: 'certificates', where: { nameAsPrinted: { like: TAG } } })
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-admin-views' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

const references = (items: ScheduleItem[]) =>
  items.map((item) => item.reference).filter((reference) => reference.startsWith(REF))

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  const roles: Record<Who, string> = {
    owner: 'owner',
    operator: 'operator',
    practitionerA: 'practitioner',
    practitionerB: 'practitioner',
    finance: 'finance',
    editor: 'editor',
  }
  for (const [key, role] of Object.entries(roles) as [Who, string][]) {
    staff[key] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${key}`,
        email: `${TAG}.${key}@example.invalid`,
        password: PASSWORD,
        roles: [role],
      } as User,
    })
  }
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-admin-views-${Date.now()}`,
      register: 'counselling',
      format: 'online',
    } as Service,
  })
  profile.mine = await payload.create({
    collection: 'practitioners',
    data: {
      publicName: `Fake mine ${TAG}`,
      staff: staff.practitionerA.id,
      active: true,
    } as Practitioner,
  })
  profile.theirs = await payload.create({
    collection: 'practitioners',
    data: {
      publicName: `Fake theirs ${TAG}`,
      staff: staff.practitionerB.id,
      active: true,
    } as Practitioner,
  })
  for (const side of ['mine', 'theirs'] as const) {
    client[side] = await payload.create({
      collection: 'people',
      data: {
        fullName: `Fake Person ${side} ${TAG}`,
        mobile: '+918123456789',
        email: `${TAG}.${side}@example.invalid`,
      } as Person,
    })
  }
  const at = (hour: number, minutes = 0) => new Date(`${DAY}T${hour}:${minutes || '00'}:00+05:30`)
  for (const [side, hour] of [
    ['mine', 10],
    ['theirs', 11],
  ] as const) {
    booking[side] = await payload.create({
      collection: 'bookings',
      data: {
        reference: `${REF}${(Date.now() % 1_000_000).toString(36)}-${side}`,
        type: 'session',
        status: 'confirmed',
        paymentStatus: 'notRequired',
        service: service.id,
        person: client[side].id,
        practitioner: profile[side].id,
        startsAt: at(hour).toISOString(),
        endsAt: at(hour, 30).toISOString(),
      } as Booking,
    })
  }
})

afterAll(async () => {
  await removeTestData()
})

describe('Today', () => {
  it('shows a practitioner their own day and nothing of the office’s', async () => {
    const result = await loadToday(await reqAs('practitionerA'), NOW)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    const { schedule, needsReply, money, proof, privacy, failures, waitsOn } = result.value
    if (schedule.state !== 'ready') throw new Error(`schedule ${schedule.state}`)
    expect(references(schedule.value)).toEqual([booking.mine.reference])
    const [line] = schedule.value.filter((item) => item.reference === booking.mine.reference)
    expect(line?.clientName).toBe(client.mine.fullName)
    expect(line?.paid).toBe('free')
    for (const panel of [needsReply, money, proof, privacy, failures]) {
      expect(panel).toEqual({ state: 'not-shown' })
    }
    expect(waitsOn).toEqual([])
  })

  it('shows the office everyone’s day, its panels, and the messages that failed', async () => {
    const result = await loadToday(await reqAs('operator'), NOW)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    const { schedule, money, privacy, failures, waitsOn } = result.value
    if (schedule.state !== 'ready') throw new Error(`schedule ${schedule.state}`)
    expect(references(schedule.value).sort()).toEqual(
      [booking.mine.reference, booking.theirs.reference].sort(),
    )
    expect(money.state).toBe('ready')
    expect(privacy.state).toBe('ready')
    if (failures.state !== 'ready') throw new Error(`failures ${failures.state}`)
    // M6 is joined: failed and unanswered messages and suppressed addresses are on Today (O3,
    // O9), and nothing waits on it any more.
    expect(failures.value.map((row) => row.kind)).toEqual(
      expect.arrayContaining([
        'Messages that failed to send',
        'Messages sent with no answer from the provider',
        'Addresses suppressed in the last 7 days',
      ]),
    )
    expect(waitsOn).toEqual([])
  })
})

describe('Calendar', () => {
  it('keeps a practitioner to their own calendar, whatever the address asks for', async () => {
    const result = await loadCalendar(await reqAs('practitionerA'), {
      view: 'day',
      day: DAY,
      practitionerId: profile.theirs.id,
    })
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.practitioners).toEqual([
      { id: profile.mine.id, name: profile.mine.publicName },
    ])
    expect(result.value.query.practitionerId).toBeUndefined()
    const bookings = result.value.days.flatMap((day) =>
      day.entries.flatMap((entry) => (entry.kind === 'booking' ? [entry.item] : [])),
    )
    expect(references(bookings)).toEqual([booking.mine.reference])
  })

  it('lets the office look at one practitioner’s week', async () => {
    const result = await loadCalendar(await reqAs('operator'), {
      day: DAY,
      practitionerId: profile.theirs.id,
    })
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.days).toHaveLength(7)
    const bookings = result.value.days.flatMap((day) =>
      day.entries.flatMap((entry) => (entry.kind === 'booking' ? [entry.item] : [])),
    )
    expect(references(bookings)).toEqual([booking.theirs.reference])
  })

  it('refuses a day that is not one', async () => {
    const result = await loadCalendar(await reqAs('operator'), { day: '14 May' })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } })
  })
})

describe('the person record', () => {
  it('shows a practitioner their own client: the name, mobile, email and their bookings', async () => {
    const result = await loadPersonTimeline(await reqAs('practitionerA'), client.mine.id)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.person).toEqual({
      fullName: client.mine.fullName,
      mobile: '+918123456789',
      email: client.mine.email,
      preferredChannel: null,
    })
    expect(result.value.consents).toBeNull()
    expect(result.value.entries.map((entry) => entry.kind)).toEqual(['booking'])
    expect(result.value.entries[0]?.label).toContain(booking.mine.reference)
    expect(result.value.notes).toBeNull()
  })

  it('answers another practitioner’s client as a missing one', async () => {
    expect(await loadPersonTimeline(await reqAs('practitionerA'), client.theirs.id)).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await loadPersonTimeline(await reqAs('practitionerA'), 999_999_999)).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
  })

  it('shows the office the consents in force and names what it does not see', async () => {
    const result = await loadPersonTimeline(await reqAs('operator'), client.theirs.id)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.consents).toEqual([])
    expect(result.value.entries[0]?.label).toContain(booking.theirs.reference)
    expect(result.value.notShown.join(' ')).toMatch(/Invoices/)
    expect(result.value.notes).toBeNull()
  })
})

describe('global search', () => {
  it('finds a practitioner their own bookings only', async () => {
    const result = await searchAdmin(await reqAs('practitionerA'), { q: REF })
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.every((hit) => hit.kind === 'booking')).toBe(true)
    expect(result.value.map((hit) => hit.label)).toEqual([booking.mine.reference])
  })

  it('finds the office a person by name and by mobile, and finance no person or booking', async () => {
    const byName = await searchAdmin(await reqAs('operator'), { q: `mine ${TAG}` })
    if (!byName.ok) throw new Error(`refused: ${JSON.stringify(byName.error)}`)
    expect(byName.value.filter((hit) => hit.kind === 'person').map((hit) => hit.id)).toEqual([
      client.mine.id,
    ])
    const byMobile = await searchAdmin(await reqAs('operator'), { q: '081234 56789' })
    if (!byMobile.ok) throw new Error(`refused: ${JSON.stringify(byMobile.error)}`)
    expect(byMobile.value.some((hit) => hit.id === client.mine.id)).toBe(true)
    const finance = await searchAdmin(await reqAs('finance'), { q: REF })
    if (!finance.ok) throw new Error(`refused: ${JSON.stringify(finance.error)}`)
    expect(finance.value.filter((hit) => hit.kind !== 'invoice')).toEqual([])
  })
})

describe('Reports, Proof and Settings', () => {
  it('gives an owner every figure, each with its working or what it waits on', async () => {
    const result = await loadReports(await reqAs('owner'), { from: DAY, to: DAY }, NOW)
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`)
    expect(result.value.map((figure) => figure.key)).toEqual(Object.keys(REPORT_FIGURES))
    for (const figure of result.value) {
      expect(figure.working, figure.key).not.toBe('')
      if (figure.waitsOn) expect(figure.value, figure.key).toBeNull()
    }
    expect(await loadReports(await reqAs('operator'), {}, NOW)).toMatchObject({
      ok: false,
      error: { code: 'refused' },
    })
  })

  it('opens Proof to the office and Settings to an owner', async () => {
    expect((await loadProof(await reqAs('operator'))).ok).toBe(true)
    expect((await loadProof(await reqAs('practitionerA'))).ok).toBe(false)
    const settings = await loadSettings(await reqAs('owner'), {})
    if (!settings.ok) throw new Error(`refused: ${JSON.stringify(settings.error)}`)
    expect(settings.value.flags).toHaveLength(5)
    expect(settings.value.integrations.length).toBeGreaterThan(5)
    expect((await loadSettings(await reqAs('operator'), {})).ok).toBe(false)
  })
})

describe('the platform’s own fields', () => {
  it('lets no role write a session note through the API, its author included', async () => {
    for (const who of ['practitionerA', 'owner', 'operator'] as const) {
      await expect(
        payload.create({
          collection: 'session-notes',
          data: {
            booking: booking.mine.id,
            person: client.mine.id,
            author: staff[who].id,
            sealed: { ciphertext: 'fake' },
            keyId: 'fakekeyid000',
          },
          user: verified(staff[who]),
          overrideAccess: false,
        }),
        who,
      ).rejects.toThrow()
    }
  })

  it('lets no role issue, revoke or change a certificate through the API', async () => {
    const data = {
      certificateId: formatCertificateId(2099, 990_001),
      status: 'valid',
      person: client.mine.id,
      nameAsPrinted: `Fake Learner ${TAG}`,
      programmeName: 'Fake programme',
      completedOn: '2099-05-01',
      verifyTokenHash: 'f'.repeat(64),
    } as Certificate
    await expect(
      payload.create({
        collection: 'certificates',
        data,
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const issued = await payload.create({ collection: 'certificates', data })
    for (const who of ['owner', 'operator'] as const) {
      await expect(
        payload.update({
          collection: 'certificates',
          id: issued.id,
          data: { status: 'revoked', verifyTokenHash: 'e'.repeat(64) },
          user: verified(staff[who]),
          overrideAccess: false,
        }),
        who,
      ).rejects.toThrow()
    }
    const unchanged = await payload.findByID({ collection: 'certificates', id: issued.id })
    expect(unchanged.status).toBe('valid')
  })

  it('publishes a case study only by an owner, with the client’s approval, and stamps who', async () => {
    const draft = await payload.create({
      collection: 'case-studies',
      data: {
        title: `Fake case study ${TAG}`,
        slug: `int-admin-views-${Date.now()}`,
        clientName: 'Fake Client Organisation',
        status: 'draft',
        problem: 'Fake problem.',
        approach: 'Fake approach.',
      } as CaseStudy,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    const approval = {
      approverName: 'Fake Approver',
      approverRole: 'Fake Role',
      approvedOn: '2099-05-01',
      reference: 'Fake folder',
    }
    const update = (who: Who, data: Partial<CaseStudy>) =>
      payload.update({
        collection: 'case-studies',
        id: draft.id,
        data,
        user: verified(staff[who]),
        overrideAccess: false,
      })
    await expect(
      update('editor', { status: 'published', clientApproval: approval }),
    ).rejects.toThrow()
    await expect(update('owner', { status: 'approved' })).rejects.toThrow()
    // A typed publisher or date is not anyone's to set.
    const approved = await update('editor', {
      status: 'approved',
      clientApproval: approval,
      publishedAt: '2000-01-01T00:00:00.000Z',
    })
    expect(approved.publishedAt ?? null).toBeNull()
    const published = await update('owner', { status: 'published' })
    expect(published.status).toBe('published')
    expect(
      typeof published.publishedBy === 'object' ? published.publishedBy?.id : published.publishedBy,
    ).toBe(staff.owner.id)
    expect(published.publishedAt).toBeTruthy()
    await expect(update('editor', { title: `Changed ${TAG}` })).rejects.toThrow()
    expect((await update('editor', { status: 'withdrawn' })).status).toBe('withdrawn')
  })
})
