// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { formsStoreHere } from '@/lib/enquiryForms/deployment'
import { signDrawn, submitterHash } from '@/lib/enquiryForms/guards'
import { fakeRecentEnquiries } from '@/lib/enquiryForms/limits'
import { HIDDEN, INITIAL_FORM_STATE, type NoticeShown } from '@/lib/enquiryForms/state'
import { type EnquiryFormKind, REFUSALS } from '@/lib/enquiryForms/strings'
import { submitEnquiry, type SubmitWorld } from '@/lib/enquiryForms/submit'
import { fakeTurnstile } from '@/lib/enquiryForms/turnstile'
import { FORM_MESSAGES } from '@/lib/pipeline/forms'
import type { PipelineError, ReceivedEnquiry } from '@/lib/pipeline/leads'
import { err, ok } from '@/lib/result'

// What happens when a public form is sent (docs/17 §6), with a fake for everything outside it:
// the CRM's ReceiveEnquiry (builder A's, wired at the merge), the consent text in force, the
// stored enquiries the limits count, Turnstile and the analytics event. Every value is
// obviously fake.
const SECRET = 'test-only-secret-for-the-forms-0000000000000'
const DRAWN_AT = new Date('2026-11-23T06:30:00.000Z')
const NOW = new Date(DRAWN_AT.getTime() + 60_000)
const ADDRESS = '203.0.113.7'
const SITE = 'https://iiic.example'
const NOTICE: NoticeShown = { version: 2, text: 'Fake consent text for replies, version 2.' }

const TEAM_MAP = {
  company: 'Fake Company Pvt Ltd',
  website: 'fake.example',
  teamSizeBand: 'from11to50',
  sector: 'Fake sector',
  name: 'Fake Person',
  role: 'Fake role',
  email: 'Fake.Person@Example.com',
  mobile: '98765 43210',
  prompt: 'A fake reason for the request.',
}

const PARTNERSHIP = {
  institution: 'Fake University',
  name: 'Fake Person',
  role: 'Fake role',
  email: 'fake.person@example.com',
  phone: '+44 20 7946 0958',
  nature: 'A fake partnership.',
}

function formOf(
  kind: EnquiryFormKind,
  fields: Record<string, string>,
  extra: Record<string, string> = {},
): FormData {
  const form = new FormData()
  const values: Record<string, string> = {
    ...fields,
    consent: 'yes',
    [HIDDEN.drawn]: signDrawn(SECRET, kind, DRAWN_AT),
    [HIDDEN.page]: kind === 'teamMap' ? '/organisations/team-map' : '/institute',
    [HIDDEN.noticeVersion]: String(NOTICE.version),
    [HIDDEN.trap]: '',
    ...extra,
  }
  for (const [name, value] of Object.entries(values)) form.set(name, value)
  return form
}

function without(form: FormData, ...names: string[]): FormData {
  for (const name of names) form.delete(name)
  return form
}

type Answer = Awaited<ReturnType<SubmitWorld['receive']>>

function fakeWorld(
  overrides: Partial<SubmitWorld> = {},
  answer: Answer = ok({ enquiryId: 1, leadId: 2, outcome: 'newLead' }),
) {
  const received: ReceivedEnquiry[] = []
  const recorded: string[] = []
  const faults: unknown[] = []
  const world: SubmitWorld = {
    now: NOW,
    secrets: [SECRET],
    address: ADDRESS,
    userAgent: 'Fake browser 1.0',
    referer: `${SITE}/organisations/team-map?utm_source=fake-source&utm_campaign=fake-campaign`,
    ownOrigin: (origin) => origin === SITE,
    storesHere: true,
    turnstile: null,
    recent: fakeRecentEnquiries([]),
    noticeInForce: async () => NOTICE,
    receive: async (input) => {
      received.push(input)
      return answer
    },
    recordSubmitted: (page) => {
      recorded.push(page)
    },
    reportFault: (error) => {
      faults.push(error)
    },
    ...overrides,
  }
  return { world, received, recorded, faults }
}

const send = (kind: EnquiryFormKind, form: FormData, world: SubmitWorld) =>
  submitEnquiry(kind, INITIAL_FORM_STATE, form, world)

describe('a Team Map request, filled in', () => {
  it('is handed to the CRM with its fields checked, the consent shown and its context', async () => {
    const { world, received, recorded } = fakeWorld()
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state.status).toBe('received')
    expect(received).toHaveLength(1)
    const [input] = received
    expect(input?.kind).toBe('teamMap')
    expect(input?.fields).toMatchObject({
      company: 'Fake Company Pvt Ltd',
      website: 'https://fake.example',
      teamSizeBand: 'from11to50',
      email: 'fake.person@example.com',
      mobile: '+919876543210',
      consent: 'yes',
      noticeVersion: NOTICE.version,
    })
    expect(input?.context).toEqual({
      page: '/organisations/team-map',
      utm: { source: 'fake-source', campaign: 'fake-campaign' },
      evidence: { ip: ADDRESS, userAgent: 'Fake browser 1.0', form: 'team-map-request' },
      submitterHash: submitterHash(SECRET, ADDRESS, NOW),
      turnstile: 'off',
      receivedAt: NOW,
    })
    // The event names the page and its register only (docs/12 §7).
    expect(recorded).toEqual(['/organisations/team-map'])
  })

  it('sends nothing typed back with the acknowledgement', async () => {
    const { world } = fakeWorld()
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state).toMatchObject({ status: 'received', values: {}, utm: {}, errors: {} })
    expect(JSON.stringify(state)).not.toContain('Fake Person')
  })

  it('reads campaign tags only from this site’s own page', async () => {
    const { world, received } = fakeWorld({
      referer: 'https://elsewhere.example/?utm_source=fake-elsewhere',
    })
    await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(received[0]?.context.utm).toEqual({})
  })

  it('keeps the tags of an earlier answer, which the form carries', async () => {
    const { world, received } = fakeWorld({ referer: null })
    await send('teamMap', formOf('teamMap', TEAM_MAP, { utm_medium: 'fake-medium' }), world)
    expect(received[0]?.context.utm).toEqual({ medium: 'fake-medium' })
  })

  it('names the page by its path, and never by an address the browser made up', async () => {
    const { world, received } = fakeWorld({ referer: null })
    await send(
      'teamMap',
      formOf('teamMap', TEAM_MAP, { page: 'https://elsewhere.example/' }),
      world,
    )
    expect(received[0]?.context.page).toBe('/')
  })
})

describe('a partnership enquiry, filled in', () => {
  it('is handed to the CRM as a partnership, with a phone from outside India', async () => {
    const { world, received } = fakeWorld({ referer: `${SITE}/institute` })
    const state = await send('partnership', formOf('partnership', PARTNERSHIP), world)
    expect(state.status).toBe('received')
    expect(received[0]?.kind).toBe('partnership')
    expect(received[0]?.fields).toMatchObject({
      institution: 'Fake University',
      phone: '+442079460958',
    })
    expect(received[0]?.context.evidence.form).toBe('partnership-enquiry')
  })
})

describe('a robot’s submission', () => {
  it('gets the acknowledgement and stores nothing when the trap is filled', async () => {
    const { world, received, recorded } = fakeWorld()
    const state = await send(
      'teamMap',
      formOf('teamMap', TEAM_MAP, { homepage: 'fake.example' }),
      world,
    )
    expect(state.status).toBe('received')
    expect(received).toEqual([])
    expect(recorded).toEqual([])
  })

  it('gets the acknowledgement and stores nothing when sent within three seconds', async () => {
    const { world, received } = fakeWorld({ now: new Date(DRAWN_AT.getTime() + 2_000) })
    expect((await send('teamMap', formOf('teamMap', TEAM_MAP), world)).status).toBe('received')
    expect(received).toEqual([])
  })

  it('gets the acknowledgement and stores nothing without a time the server signed', async () => {
    const { world, received } = fakeWorld()
    const unsigned = formOf('teamMap', TEAM_MAP, { drawn: `${DRAWN_AT.getTime()}.forged` })
    expect((await send('teamMap', unsigned, world)).status).toBe('received')
    expect(
      (await send('teamMap', without(formOf('teamMap', TEAM_MAP), 'drawn'), world)).status,
    ).toBe('received')
    expect(received).toEqual([])
  })
})

describe('the consent text', () => {
  it('refuses the form while none is in force', async () => {
    const { world, received } = fakeWorld({ noticeInForce: async () => null })
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state).toMatchObject({ status: 'refused', refusal: 'no-notice' })
    expect(received).toEqual([])
  })

  it('asks again, with the new text and the box unticked, when it changed after the page', async () => {
    const newer = { version: 3, text: 'Fake consent text, version 3.' }
    const { world, received } = fakeWorld({ noticeInForce: async () => newer })
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state).toMatchObject({ status: 'refused', refusal: 'notice-changed', notice: newer })
    expect(state.values.consent).toBeUndefined()
    expect(state.values.company).toBe('Fake Company Pvt Ltd')
    expect(received).toEqual([])
  })

  it('asks again when the CRM finds the notice changed in the meantime', async () => {
    const { world } = fakeWorld({}, err<PipelineError>({ code: 'notice-changed' }))
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state).toMatchObject({ status: 'refused', refusal: 'notice-changed', notice: NOTICE })
  })
})

describe('an answer to check', () => {
  it('comes back beside its field, with what was typed, and nothing is stored', async () => {
    const { world, received } = fakeWorld()
    const form = formOf('teamMap', { ...TEAM_MAP, email: 'fake@', mobile: '12' })
    const state = await send('teamMap', without(form, 'company'), world)
    expect(state.status).toBe('invalid')
    expect(state.errors).toEqual({
      company: FORM_MESSAGES.company,
      email: FORM_MESSAGES.email,
      mobile: FORM_MESSAGES.phone,
    })
    expect(state.values).toMatchObject({ email: 'fake@', mobile: '12', consent: 'yes' })
    expect(received).toEqual([])
  })

  it('includes the consent box, which the person must tick', async () => {
    const { world, received } = fakeWorld()
    const state = await send('teamMap', without(formOf('teamMap', TEAM_MAP), 'consent'), world)
    expect(state.status).toBe('invalid')
    expect(state.errors).toEqual({ consent: FORM_MESSAGES.consent })
    expect(received).toEqual([])
  })

  it('counts each answer, so the form draws its summary and its check again', async () => {
    const { world } = fakeWorld()
    const form = without(formOf('teamMap', TEAM_MAP), 'consent')
    const first = await submitEnquiry('teamMap', INITIAL_FORM_STATE, form, world)
    const second = await submitEnquiry('teamMap', first, form, world)
    expect([first.attempt, second.attempt]).toEqual([1, 2])
    // The browser sends the previous state back: anything but a count is no count.
    const odd = { attempt: 'many' } as unknown as typeof first
    expect((await submitEnquiry('teamMap', odd, form, world)).attempt).toBe(1)
  })
})

describe('Turnstile, where its keys are set', () => {
  it('asks the person to send the form again when the check fails or is missing', async () => {
    const check = fakeTurnstile(['fake-good-token'])
    const { world, received } = fakeWorld({ turnstile: check })
    const bad = formOf('teamMap', TEAM_MAP, { 'cf-turnstile-response': 'fake-bad-token' })
    expect(await send('teamMap', bad, world)).toMatchObject({
      status: 'refused',
      refusal: 'turnstile',
    })
    expect(await send('teamMap', formOf('teamMap', TEAM_MAP), world)).toMatchObject({
      refusal: 'turnstile',
    })
    expect(received).toEqual([])
  })

  it('records that the person passed', async () => {
    const { world, received } = fakeWorld({ turnstile: fakeTurnstile(['fake-good-token']) })
    const good = formOf('teamMap', TEAM_MAP, { 'cf-turnstile-response': 'fake-good-token' })
    expect((await send('teamMap', good, world)).status).toBe('received')
    expect(received[0]?.context.turnstile).toBe('passed')
  })
})

describe('the rate limits', () => {
  const stored = (count: number, row: { submitterHash?: string; email?: string }) =>
    Array.from({ length: count }, (_, index) => ({
      submitterHash: row.submitterHash ?? `fake-hash-${index}`,
      email: row.email ?? `fake-${index}@example.com`,
      receivedAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    }))

  it('stop the sixth enquiry in an hour from one address', async () => {
    const hash = submitterHash(SECRET, ADDRESS, NOW)
    const { world, received } = fakeWorld({
      recent: fakeRecentEnquiries(stored(5, { submitterHash: hash })),
    })
    expect(await send('teamMap', formOf('teamMap', TEAM_MAP), world)).toMatchObject({
      status: 'refused',
      refusal: 'limit',
    })
    expect(received).toEqual([])
    const four = fakeWorld({ recent: fakeRecentEnquiries(stored(4, { submitterHash: hash })) })
    expect((await send('teamMap', formOf('teamMap', TEAM_MAP), four.world)).status).toBe('received')
  })

  it('stop the fourth enquiry in a day from one email address', async () => {
    const { world, received } = fakeWorld({
      recent: fakeRecentEnquiries(stored(3, { email: 'fake.person@example.com' })),
    })
    expect(await send('teamMap', formOf('teamMap', TEAM_MAP), world)).toMatchObject({
      refusal: 'limit',
    })
    expect(received).toEqual([])
  })
})

describe('a preview of the site, which shares production’s database (docs/16 §10)', () => {
  it('stores nothing, asks nothing of Turnstile, records no event and says so', async () => {
    const checked: string[] = []
    const { world, received, recorded } = fakeWorld({
      storesHere: false,
      turnstile: async (token) => {
        checked.push(token)
        return true
      },
    })
    for (const [kind, fields] of [
      ['teamMap', TEAM_MAP],
      ['partnership', PARTNERSHIP],
    ] as const) {
      const state = await send(
        kind,
        formOf(kind, fields, { [HIDDEN.turnstile]: 'x'.repeat(40) }),
        world,
      )
      expect(state, kind).toMatchObject({ status: 'refused', refusal: 'preview' })
      // What was typed stays in the form.
      expect(state.values.name, kind).toBe('Fake Person')
    }
    expect(received).toEqual([])
    expect(recorded).toEqual([])
    expect(checked).toEqual([])
    expect(REFUSALS.preview).toContain('preview')
  })

  it('still checks the answers, so the team can try the form there', async () => {
    const { world, received } = fakeWorld({ storesHere: false })
    const state = await send(
      'teamMap',
      formOf('teamMap', { ...TEAM_MAP, email: 'not-an-email' }),
      world,
    )
    expect(state.status).toBe('invalid')
    expect(received).toEqual([])
  })

  it('is any Vercel deployment but production; locally and in CI the forms store', () => {
    expect(formsStoreHere({ VERCEL_ENV: undefined })).toBe(true)
    expect(formsStoreHere({ VERCEL_ENV: 'production' })).toBe(true)
    expect(formsStoreHere({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(formsStoreHere({ VERCEL_ENV: 'development' })).toBe(false)
  })
})

describe('a fault', () => {
  it('is reported by itself, and the person is told the form was not sent', async () => {
    const fault = new Error('fake database fault')
    const { world, faults, recorded } = fakeWorld({
      receive: async () => {
        throw fault
      },
    })
    const state = await send('teamMap', formOf('teamMap', TEAM_MAP), world)
    expect(state).toMatchObject({ status: 'refused', refusal: 'failed' })
    expect(faults).toEqual([fault])
    expect(recorded).toEqual([])
  })

  it('from the CRM, such as a refusal it has no words for, is a fault too', async () => {
    const { world } = fakeWorld({}, err<PipelineError>({ code: 'not-allowed' }))
    expect(await send('teamMap', formOf('teamMap', TEAM_MAP), world)).toMatchObject({
      refusal: 'failed',
    })
  })
})
