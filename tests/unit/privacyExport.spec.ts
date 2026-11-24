// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { EXPORT_SECTIONS, exportKeys, exportPersonDataWith, pageKeyOf, renderExportPage } =
  await import('@/lib/privacy/export')
const { exportFolderOf, folderStore, isSafeFolder, isSafeKey, privateStoreFor } =
  await import('@/lib/privacy/store')
const { planOf, PLAN_LINES } = await import('@/lib/privacy/erasure')
const { codeEnteredRecently } = await import('@/lib/privacy/stepUp')

// The access export's page and keys, the erasure plan's lines, and the refusals that come before
// any record is read (docs/18 §5). Fake people and values only.

const empty = Object.fromEntries(
  EXPORT_SECTIONS.map(({ key }) => [key, []]),
) as unknown as Parameters<typeof renderExportPage>[0]

describe('the export’s readable page', () => {
  it('escapes what people typed and shows times in India', () => {
    const page = renderExportPage({
      ...empty,
      generatedAt: '2027-03-01T04:30:00.000Z',
      person: [
        {
          id: 1,
          fullName: 'Fake <script>alert(1)</script> Person',
          createdAt: '2027-01-31T18:45:00.000Z',
        },
      ],
    })
    expect(page).not.toContain('<script>alert')
    expect(page).toContain('Fake &lt;script&gt;')
    expect(page).toContain('1 February 2027, 12:15 AM IST')
    expect(page).toContain('1 March 2027, 10 AM IST')
  })

  it('has no section for session notes (D-11, assumed not disclosed)', () => {
    expect(EXPORT_SECTIONS.map(({ key }) => key)).not.toContain('notes')
    expect(renderExportPage({ ...empty, generatedAt: '2027-03-01T04:30:00.000Z' })).not.toMatch(
      /session note/i,
    )
  })
})

describe('the private store’s keys', () => {
  it('names an export by its request and time, and its page beside it', () => {
    const keys = exportKeys(12, new Date('2027-03-01T04:30:05.000Z'))
    expect(keys.json).toBe('privacy-exports/request-12/export-20270301043005.json')
    expect(pageKeyOf(keys.json)).toBe(keys.html)
    expect(isSafeKey(keys.json)).toBe(true)
  })

  it('refuses a key that could leave its folder', () => {
    for (const key of [
      '../etc/passwd.json',
      'privacy-exports/../../x.json',
      '/abs/x.json',
      'a\\b.json',
      'x.exe',
    ]) {
      expect(isSafeKey(key)).toBe(false)
    }
  })

  it('is the private bucket once R2 and the bucket are set, none on Vercel without, else the folder', async () => {
    const bucket = {
      R2_ACCOUNT_ID: 'example-account',
      R2_ACCESS_KEY_ID: 'example-key-id',
      R2_SECRET_ACCESS_KEY: 'example-secret',
      R2_BUCKET_PRIVATE: 'iiic-private',
    }
    expect(privateStoreFor({ ...bucket, VERCEL_ENV: 'production' })).not.toBeNull()
    for (const VERCEL_ENV of ['development', 'preview', 'production'] as const) {
      expect(privateStoreFor({ VERCEL_ENV, R2_BUCKET_PRIVATE: 'iiic-private' })).toBeNull()
    }
    const folder = privateStoreFor({}, '/never-written')
    expect(folder).not.toBeNull()
    // A key outside the store's folder is refused before anything is read or written.
    await expect(folder?.get('../etc/passwd.json') as Promise<unknown>).rejects.toThrow()
  })
})

const survey = {
  exports: 1,
  enquiries: 2,
  pipelineLinks: 3,
  subscribers: 1,
  suppressions: 1,
  bookingIds: [1, 2],
  ownBookings: 2,
  notes: 3,
  feedback: 1,
  reviews: 0,
  consentsInForce: 2,
  ledger: 4,
  payments: 1,
  refunds: 0,
  invoices: 1,
  individualInvoices: 1,
  certificates: 0,
  requests: 1,
  audit: 5,
}

describe('the erasure plan', () => {
  it('counts the session notes for an owner and leaves them out for the operator', () => {
    const forOwner = planOf(survey, true)
    expect(forOwner.deletes).toContainEqual({ entity: PLAN_LINES.notes, count: 3 })
    const forOperator = planOf(survey, false)
    expect(forOperator.deletes.map((line) => line.entity)).not.toContain(PLAN_LINES.notes)
  })

  it('says why each kept record is kept', () => {
    for (const line of planOf(survey, true).keeps) expect(line.why.length).toBeGreaterThan(10)
  })

  it('names what M4 and M6 hold: enquiries, links, the subscription and exports go, suppressions stay', () => {
    const plan = planOf(survey, false)
    expect(plan.deletes).toEqual(
      expect.arrayContaining([
        { entity: PLAN_LINES.enquiries, count: 2 },
        { entity: PLAN_LINES.pipelineLinks, count: 3 },
        { entity: PLAN_LINES.subscriber, count: 1 },
        { entity: PLAN_LINES.exports, count: 1 },
      ]),
    )
    expect(plan.keeps).toContainEqual(
      expect.objectContaining({ entity: PLAN_LINES.suppressions, count: 1 }),
    )
  })
})

describe('the private store’s folders', () => {
  it('removes one request’s exports and nothing beside them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'iiic-store-unit-'))
    try {
      const store = folderStore(root)
      await store.put('privacy-exports/request-7/export-1.json', '{}', 'application/json')
      await store.put('privacy-exports/request-8/export-1.json', '{}', 'application/json')
      await store.removeAll(exportFolderOf(7))
      expect(await store.get('privacy-exports/request-7/export-1.json')).toBeNull()
      expect(await store.get('privacy-exports/request-8/export-1.json')).not.toBeNull()
      // A folder already gone is no error.
      await expect(store.removeAll(exportFolderOf(7))).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses the store’s root and any folder that could leave it', async () => {
    for (const folder of ['', '/', 'privacy-exports/', '../x/', 'privacy-exports/../x/', 'a\\b/']) {
      expect(isSafeFolder(folder), folder).toBe(false)
    }
    await expect(folderStore('/never-written').removeAll('privacy-exports/')).rejects.toThrow()
  })
})

const reqWith = (user: unknown, context: Record<string, unknown> = {}) =>
  ({ user, context, payload: {} }) as unknown as PayloadRequest

const owner = { id: 1, collection: 'users', _strategy: 'totp', roles: ['owner'], active: true }

describe('an export before any record is read', () => {
  const exportWith = exportPersonDataWith(() => null)

  it('is refused without a staff session, and to the operator', async () => {
    expect(await exportWith(reqWith(null), 1)).toMatchObject({
      ok: false,
      error: { code: 'refused' },
    })
    const operator = { ...owner, roles: ['operator'] }
    expect(await exportWith(reqWith(operator), 1)).toMatchObject({
      ok: false,
      error: { code: 'refused', refusal: { code: 'not-allowed' } },
    })
  })

  it('asks an owner for the code again', async () => {
    expect(await exportWith(reqWith(owner), 1)).toMatchObject({
      ok: false,
      error: { code: 'refused', refusal: { code: 'enter-code' } },
    })
  })

  it('counts a code entered for five minutes only', () => {
    const at = Date.now()
    const req = reqWith(owner, { privacyCodeEnteredAt: at })
    expect(codeEnteredRecently(req, at + 4 * 60 * 1000)).toBe(true)
    expect(codeEnteredRecently(req, at + 5 * 60 * 1000)).toBe(false)
    expect(codeEnteredRecently(reqWith(owner))).toBe(false)
  })
})
