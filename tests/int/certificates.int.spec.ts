import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { CertificateStore } from '@/lib/certificates/contract'
import type { CertificateEvent } from '@/lib/certificates/events'
import { formatCertificateId } from '@/lib/certificates/ids'
import { type CertificateDeps, makeCertificateActions } from '@/lib/certificates/issue'
import { findRecipients } from '@/lib/certificates/recipients'
import { memoryStore } from '@/lib/certificates/store'
import { readCertificateTemplate } from '@/lib/certificates/template'
import { newVerifyToken } from '@/lib/certificates/token'
import { makeVerify } from '@/lib/certificates/verify'
import { err, ok } from '@/lib/result'
import type { Person, PlatformSettings, User } from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

// The certificates module against the real Postgres (docs/18 §4, §9; D-39): the collection takes
// no write through the API and never returns the token's hash; an issue, a revoke and a reissue
// commit together with their audit entries under their own names; a failure rolls the batch back;
// the verify lookups say Valid, Revoked, and for a reissue the new ID; a download is audited; and
// every act refuses anonymous, code-less, deactivated and wrong-role requests. Every record is
// obviously fake, numbered in 2099, and removed at the end; the signatory is put back. The
// certificate.issued event has no listener yet (C5 is M6's), so nothing is queued.

let payload: Payload
const TAG = 'int.certificates'
const YEAR_PREFIX = 'IIIC-C-2099-'
const SITE = 'https://example.invalid'
const staff = {} as Record<'owner' | 'operator' | 'editor' | 'finance' | 'leaver', User>
const people = {} as Record<'first' | 'second', Person>
let savedCertificates: PlatformSettings['certificates']

const store = memoryStore()
const events: CertificateEvent[] = []
const tokens: string[] = []

function depsOf(over: Partial<CertificateDeps> = {}): CertificateDeps {
  return {
    store: () => ok(store),
    render: async () => new TextEncoder().encode(`%PDF-1.7 fake ${TAG}`),
    selfContain: async (html) => html,
    template: readCertificateTemplate,
    siteUrl: () => SITE,
    // A day in 2099, so the numbers never meet a real certificate's.
    now: () => new Date('2099-04-02T06:00:00.000Z'),
    newToken: () => {
      const token = newVerifyToken()
      tokens.push(token)
      return token
    },
    newBatch: () => `batch-${TAG}`,
    emit: async (_req, event) => {
      events.push(event)
    },
    ...over,
  }
}

const actions = makeCertificateActions(depsOf())
const verify = makeVerify(async () => payload)

const as = (user: User, strategy = 'totp'): Promise<PayloadRequest> =>
  createLocalReq({ user: { ...user, collection: 'users', _strategy: strategy } as User }, payload)
const anonymous = (): Promise<PayloadRequest> => createLocalReq({}, payload)

const programme = {
  programmeName: `Example Programme ${TAG}`,
  programmeDetails: 'Example batch (fake)',
  completedOn: '2099-03-30',
}

async function removeTestData() {
  // A replacement first, so nothing still points at the one it replaced.
  const { docs } = await payload.find({
    collection: 'certificates',
    where: { certificateId: { like: YEAR_PREFIX } },
    pagination: false,
    depth: 0,
  })
  for (const doc of [...docs].sort((a, b) => b.id - a.id)) {
    await payload.delete({ collection: 'certificates', id: doc.id })
  }
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

async function auditOf(id: number) {
  const { docs } = await payload.find({
    collection: 'audit-log',
    where: { entity: { equals: 'certificates' }, entityId: { equals: String(id) } },
    sort: 'at',
    pagination: false,
    overrideAccess: true,
  })
  return docs.map(({ action }) => action)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
  savedCertificates = settings.certificates
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      certificates: {
        signatoryName: 'Example Signatory (fake)',
        signatoryTitle: 'Example Title (fake)',
      },
    },
  })
  for (const role of ['owner', 'operator', 'editor', 'finance'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role}`,
        email: `${TAG}.${role}@example.invalid`,
        password: 'test-only-password-certificates',
        roles: [role],
      },
    })
  }
  staff.leaver = await payload.create({
    collection: 'users',
    data: {
      name: 'Fake leaver',
      email: `${TAG}.leaver@example.invalid`,
      password: 'test-only-password-certificates',
      roles: ['owner'],
      active: false,
    },
  })
  people.first = await payload.create({
    collection: 'people',
    data: { fullName: `Example Learner ${TAG}` } as Person,
  })
  people.second = await payload.create({
    collection: 'people',
    data: { fullName: `Example Second Learner ${TAG}` } as Person,
  })
})

afterAll(async () => {
  await removeTestData()
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      certificates: {
        signatoryName: savedCertificates?.signatoryName ?? null,
        signatoryTitle: savedCertificates?.signatoryTitle ?? null,
      },
    },
  })
})

const issueTwo = async () => {
  const issued = await actions.issue(await as(staff.operator), {
    ...programme,
    recipients: [
      { personId: people.first.id, nameAsPrinted: 'Example Learner' },
      { personId: people.second.id, nameAsPrinted: 'Example Second Learner' },
    ],
  })
  if (!issued.ok) throw new Error(issued.error.code)
  return issued.value
}

describe('the collection', () => {
  it('takes no write through the API, from any role', async () => {
    for (const role of ['owner', 'operator'] as const) {
      await expect(
        payload.create({
          collection: 'certificates',
          data: {
            certificateId: formatCertificateId(2099, 9001),
            status: 'valid',
            person: people.first.id,
            nameAsPrinted: 'Example Learner',
            programmeName: programme.programmeName,
            completedOn: programme.completedOn,
          } as never,
          overrideAccess: false,
          user: { ...staff[role], collection: 'users', _strategy: 'totp' } as User,
        }),
      ).rejects.toThrow()
    }
  })

  it('never returns the token’s hash, and lets only the office read', async () => {
    const [made] = await issueTwo()
    const read = await payload.findByID({
      collection: 'certificates',
      id: made!.id,
      overrideAccess: false,
      user: { ...staff.owner, collection: 'users', _strategy: 'totp' } as User,
    })
    expect(read.certificateId).toBe(made!.certificateId)
    expect(read).not.toHaveProperty('verifyTokenHash')
    const { docs } = await payload.find({
      collection: 'certificates',
      where: { id: { equals: made!.id } },
      overrideAccess: false,
      user: { ...staff.editor, collection: 'users', _strategy: 'totp' } as User,
    })
    expect(docs).toEqual([])
  })
})

describe('issuing, revoking and reissuing', () => {
  it('issues a batch numbered in its year, each audited as issue-certificate, with its PDF', async () => {
    const issued = await issueTwo()
    expect(issued).toHaveLength(2)
    for (const { id, certificateId } of issued) {
      expect(certificateId.startsWith(YEAR_PREFIX)).toBe(true)
      expect(await auditOf(id)).toEqual(['issue-certificate'])
      const row = await payload.findByID({ collection: 'certificates', id, depth: 0 })
      expect(row.pdfKey && (await store.get(row.pdfKey))).toBeTruthy()
    }
    const [a, b] = issued.map(({ certificateId }) => Number(certificateId.split('-')[3]))
    expect((b as number) - (a as number)).toBe(1)
    expect(events.slice(-2)).toEqual(
      issued.map(({ id }) => ({ name: 'certificate.issued', certificateId: id })),
    )
  })

  it('rolls the whole batch back when a PDF cannot be stored', async () => {
    const before = await payload.count({
      collection: 'certificates',
      where: { certificateId: { like: YEAR_PREFIX } },
    })
    const broken: CertificateStore = {
      put: async () => {
        throw new Error('fake bucket failure')
      },
      get: async () => null,
    }
    const failing = makeCertificateActions(depsOf({ store: () => ok(broken) }))
    await expect(
      failing.issue(await as(staff.operator), {
        ...programme,
        recipients: [{ personId: people.first.id, nameAsPrinted: 'Example Learner' }],
      }),
    ).rejects.toThrow('fake bucket failure')
    const after = await payload.count({
      collection: 'certificates',
      where: { certificateId: { like: YEAR_PREFIX } },
    })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('verify shows valid, revoke shows revoked at once, audited as revoke-certificate', async () => {
    const [made] = await issueTwo()
    const token = tokens.at(-2) as string
    expect(await verify.verifyByToken(token)).toMatchObject({
      found: true,
      status: 'valid',
      name: 'Example Learner',
    })
    const revoked = await actions.revoke(await as(staff.owner), {
      certificateId: made!.id,
      reason: 'Issued in error (fake)',
    })
    expect(revoked).toEqual(ok({ id: made!.id }))
    const page = await verify.verifyByToken(token)
    expect(page).toMatchObject({ found: true, status: 'revoked', revokedOn: '2099-04-02' })
    expect(JSON.stringify(page)).not.toContain('Issued in error')
    expect(await auditOf(made!.id)).toEqual(['issue-certificate', 'revoke-certificate'])
  })

  it('a reissue’s old page names the new ID, in one transaction, audited as reissue-certificate', async () => {
    const [old] = await issueTwo()
    const reissued = await actions.reissue(await as(staff.owner), {
      certificateId: old!.id,
      reason: 'Name misspelt (fake)',
      nameAsPrinted: 'Example Learner Corrected',
    })
    if (!reissued.ok) throw new Error(reissued.error.code)
    const fresh = reissued.value
    expect(fresh.certificateId).not.toBe(old!.certificateId)

    const replacement = await payload.findByID({ collection: 'certificates', id: fresh.id, depth: 0 })
    expect(replacement).toMatchObject({ replaces: old!.id, nameAsPrinted: 'Example Learner Corrected' })
    expect(await auditOf(old!.id)).toEqual(['issue-certificate', 'reissue-certificate'])
    expect(await auditOf(fresh.id)).toEqual(['reissue-certificate'])

    expect(await verify.verifyById(old!.certificateId)).toMatchObject({
      found: true,
      status: 'revoked',
      replacedBy: fresh.certificateId,
      name: 'E. L.',
    })
    expect(await verify.verifyById(fresh.certificateId)).toMatchObject({
      status: 'valid',
      replacedBy: null,
    })
    expect(
      await actions.reissue(await as(staff.owner), { certificateId: old!.id, reason: 'Again (fake)' }),
    ).toEqual(err({ code: 'already-revoked' }))
  })

  it('typing an ID shows only the initials and what the design allows', async () => {
    const [made] = await issueTwo()
    const view = await verify.verifyById(` ${made!.certificateId.toLowerCase()} `)
    expect(Object.keys(view).sort()).toEqual(
      [
        'certificateId',
        'completedOn',
        'found',
        'issuedOn',
        'name',
        'programmeDetails',
        'programmeName',
        'replacedBy',
        'revokedOn',
        'status',
      ].sort(),
    )
    expect(view).toMatchObject({ name: 'E. L.', status: 'valid' })
    expect(await verify.verifyById(formatCertificateId(2099, 99_999))).toEqual({ found: false })
    expect(await verify.verifyByToken('AAAAAAAAAAAAAAAAAAAAAA')).toEqual({ found: false })
  })

  it('records download-certificate for a download', async () => {
    const [made] = await issueTwo()
    const file = await actions.download(await as(staff.operator), made!.id)
    expect(file.ok).toBe(true)
    expect(await auditOf(made!.id)).toEqual(['issue-certificate', 'download-certificate'])
  })
})

describe('anonymous and unauthorised requests are refused', () => {
  it('refuses every act to no one, no code, a deactivated owner and the wrong roles', async () => {
    const [made] = await issueTwo()
    const requests: [PayloadRequest, number, string][] = [
      [await anonymous(), 401, 'sign-in'],
      [await as(staff.owner, 'local-jwt'), 403, 'enter-code'],
      [await as(staff.leaver), 403, 'not-allowed'],
      [await as(staff.editor), 403, 'not-allowed'],
      [await as(staff.finance), 403, 'not-allowed'],
    ]
    for (const [req, status, code] of requests) {
      const refusal = err({ code: 'refused', refusal: { status, code } })
      expect(await actions.preview(req, programme)).toEqual(refusal)
      expect(
        await actions.issue(req, {
          ...programme,
          recipients: [{ personId: people.first.id, nameAsPrinted: 'Example Learner' }],
        }),
      ).toEqual(refusal)
      expect(await actions.revoke(req, { certificateId: made!.id, reason: 'Fake reason' })).toEqual(
        refusal,
      )
      expect(await actions.reissue(req, { certificateId: made!.id, reason: 'Fake reason' })).toEqual(
        refusal,
      )
      expect(await actions.download(req, made!.id)).toEqual(refusal)
      expect(await findRecipients(req, { q: 'Example' })).toEqual(refusal)
    }
    // The operator issues, but revoking and reissuing are an owner's.
    const operator = await as(staff.operator)
    const notAllowed = err({ code: 'refused', refusal: { status: 403, code: 'not-allowed' } })
    expect(await actions.revoke(operator, { certificateId: made!.id, reason: 'Fake reason' })).toEqual(
      notAllowed,
    )
    expect(await actions.reissue(operator, { certificateId: made!.id, reason: 'Fake reason' })).toEqual(
      notAllowed,
    )
    expect(await auditOf(made!.id)).toEqual(['issue-certificate'])
    const row = await payload.findByID({ collection: 'certificates', id: made!.id, depth: 0 })
    expect(row.status).toBe('valid')
  })

  it('finds recipients by name for the office, with no contact detail', async () => {
    const found = await findRecipients(await as(staff.operator), { q: `Second Learner ${TAG}` })
    expect(found).toEqual(
      ok([{ personId: people.second.id, fullName: `Example Second Learner ${TAG}` }]),
    )
  })
})
