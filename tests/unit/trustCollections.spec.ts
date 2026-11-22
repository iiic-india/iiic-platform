// @vitest-environment node
import { APIError, ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  completeEntry,
  entryTitle,
  nameEntry,
  neverChange,
  neverDelete,
} from '@/collections/Consents'
import {
  isInForce,
  keepInForce,
  keepInForceOnDelete,
  nameVersion,
  numberVersion,
} from '@/collections/ConsentVersions'
import { oneVerifiedPerson, withdrawConsentsOnDeletion } from '@/collections/People'
import { LEDGER_MESSAGES } from '@/lib/privacy/consentLedger'
import { RECORD_DELETED } from '@/lib/privacy/consents'

// The hooks of the trust layer's collections (docs/04), against a fake Payload: the consent
// ledger fills in and checks each entry and never changes one; a consent text is numbered and
// fixed once in force; a verified detail belongs to one person, and deleting a person marks
// their consents withdrawn. The database rules themselves are in tests/int.
const payload = { findByID: vi.fn(), count: vi.fn(), find: vi.fn(), create: vi.fn() }
const req = (context: Record<string, unknown> = {}) => ({ payload, context }) as never

beforeEach(() => {
  for (const fn of Object.values(payload)) fn.mockReset()
})

type Hook = (args: Record<string, unknown>) => unknown
const run = (hook: unknown, args: Record<string, unknown>) => (hook as Hook)(args)

/** The field and the message of a refusal, as the admin shows it. */
async function refusal(promise: unknown): Promise<{ path?: string; message?: string }> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError)
    return (error as ValidationError).data.errors[0] ?? {}
  }
  throw new Error('fake: expected a refusal')
}

const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const ahead = (days: number) => new Date(NOW + days * 86_400_000).toISOString()

/** A consent as the ledger holds it. Obviously fake ids. */
const GRANT = {
  id: 41,
  person: 7,
  purpose: 'marketingEmail',
  noticeVersion: 3,
  language: 'en-IN',
  grantedAt: ago(10),
  channel: 'web',
}
const VERSION = { id: 3, purpose: 'marketingEmail', language: 'en-IN', effectiveFrom: ago(30) }

describe('recording a withdrawal', () => {
  it('copies the consent it ends, and records now as the time it was withdrawn', async () => {
    payload.findByID.mockResolvedValue(GRANT)
    payload.count.mockResolvedValue({ totalDocs: 0 })
    const data = (await run(completeEntry, {
      data: { withdraws: 41, channel: 'email', evidence: { reference: 'fake-reply.eml' } },
      operation: 'create',
      req: req(),
    })) as Record<string, unknown>
    expect(data).toMatchObject({
      withdraws: 41,
      person: 7,
      purpose: 'marketingEmail',
      noticeVersion: 3,
      language: 'en-IN',
      grantedAt: GRANT.grantedAt,
      channel: 'email',
    })
    expect(Date.parse(data.withdrawnAt as string)).toBeGreaterThanOrEqual(NOW)
    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'consents', where: { withdraws: { equals: 41 } } }),
    )
  })

  it('takes the time a reply arrived, but never one before the consent or in the future', async () => {
    payload.findByID.mockResolvedValue(GRANT)
    payload.count.mockResolvedValue({ totalDocs: 0 })
    const entry = (withdrawnAt: string) =>
      run(completeEntry, {
        data: { withdraws: 41, channel: 'whatsapp', withdrawnAt },
        operation: 'create',
        req: req(),
      })
    expect(await entry(ago(2))).toMatchObject({ withdrawnAt: ago(2) })
    expect(await refusal(entry(ago(20)))).toEqual({
      path: 'withdrawnAt',
      message: LEDGER_MESSAGES.beforeGrant,
    })
    expect(await refusal(entry(ahead(1)))).toEqual({
      path: 'withdrawnAt',
      message: LEDGER_MESSAGES.future,
    })
  })

  it('ends a consent once, and only a consent', async () => {
    payload.findByID.mockResolvedValue(GRANT)
    payload.count.mockResolvedValue({ totalDocs: 1 })
    const entry = () =>
      run(completeEntry, {
        data: { withdraws: 41, channel: 'web' },
        operation: 'create',
        req: req(),
      })
    expect(await refusal(entry())).toEqual({
      path: 'withdraws',
      message: LEDGER_MESSAGES.alreadyWithdrawn,
    })
    payload.findByID.mockResolvedValue({ ...GRANT, withdraws: 40 })
    expect(await refusal(entry())).toEqual({
      path: 'withdraws',
      message: LEDGER_MESSAGES.notAGrant,
    })
    payload.findByID.mockResolvedValue(null)
    expect(await refusal(entry())).toEqual({ path: 'withdraws', message: LEDGER_MESSAGES.noGrant })
  })
})

describe('recording a consent', () => {
  it('takes the purpose and the language from the notice, and the time as now', async () => {
    payload.findByID.mockResolvedValue(VERSION)
    const data = (await run(completeEntry, {
      data: { person: 7, noticeVersion: 3, channel: 'web' },
      operation: 'create',
      req: req(),
    })) as Record<string, unknown>
    expect(data).toMatchObject({ purpose: 'marketingEmail', language: 'en-IN' })
    expect(Date.parse(data.grantedAt as string)).toBeGreaterThanOrEqual(NOW)
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'consent-versions', id: 3 }),
    )
  })

  it('needs the notice the person saw to have been in force when they gave it', async () => {
    payload.findByID.mockResolvedValue({ ...VERSION, effectiveFrom: ago(5) })
    expect(
      await refusal(
        run(completeEntry, {
          data: { person: 7, noticeVersion: 3, channel: 'email', grantedAt: ago(6) },
          operation: 'create',
          req: req(),
        }),
      ),
    ).toEqual({ path: 'noticeVersion', message: LEDGER_MESSAGES.notInForce })
  })

  it('refuses another purpose than the notice’s, a withdrawal time, a future time and an unknown notice', async () => {
    payload.findByID.mockResolvedValue(VERSION)
    const entry = (data: Record<string, unknown>) =>
      run(completeEntry, {
        data: { person: 7, noticeVersion: 3, channel: 'web', ...data },
        operation: 'create',
        req: req(),
      })
    expect(await refusal(entry({ purpose: 'mapStorage' }))).toEqual({
      path: 'purpose',
      message: LEDGER_MESSAGES.otherPurpose,
    })
    expect(await refusal(entry({ withdrawnAt: ago(1) }))).toEqual({
      path: 'withdrawnAt',
      message: LEDGER_MESSAGES.givenWithdrawn,
    })
    expect(await refusal(entry({ grantedAt: ahead(1) }))).toEqual({
      path: 'grantedAt',
      message: LEDGER_MESSAGES.future,
    })
    payload.findByID.mockResolvedValue(null)
    expect(await refusal(entry({}))).toEqual({
      path: 'noticeVersion',
      message: LEDGER_MESSAGES.notice,
    })
  })

  it('leaves a missing notice to the field’s own check', async () => {
    const data = { person: 7, channel: 'web' }
    expect(await run(completeEntry, { data, operation: 'create', req: req() })).toBe(data)
    expect(payload.findByID).not.toHaveBeenCalled()
  })
})

describe('the deleted-record channel', () => {
  it('is only for the withdrawals a deletion makes', async () => {
    payload.findByID.mockResolvedValue(GRANT)
    payload.count.mockResolvedValue({ totalDocs: 0 })
    const data = { withdraws: 41, channel: 'recordDeleted' }
    expect(await refusal(run(completeEntry, { data, operation: 'create', req: req() }))).toEqual({
      path: 'channel',
      message: LEDGER_MESSAGES.deletedOnly,
    })
    expect(
      await run(completeEntry, { data, operation: 'create', req: req({ [RECORD_DELETED]: true }) }),
    ).toMatchObject({ withdraws: 41, person: 7 })
  })
})

describe('the name of an entry', () => {
  it('is the purpose and when it was given or withdrawn, in India, set as it is created', () => {
    const given = { purpose: 'marketingEmail', grantedAt: '2026-12-01T06:00:00Z' }
    expect(entryTitle(given)).toBe('Marketing email, given 1 December 2026 at 11:30 AM')
    const ended = { ...given, withdraws: 41, withdrawnAt: '2026-12-05T09:30:00Z' }
    expect(entryTitle(ended)).toBe('Marketing email, withdrawn 5 December 2026 at 3 PM')
    expect(run(nameEntry, { data: given, operation: 'create' })).toMatchObject({
      title: 'Marketing email, given 1 December 2026 at 11:30 AM',
    })
    expect(run(nameEntry, { data: given, operation: 'update' })).toBe(given)
  })
})

describe('an entry once recorded', () => {
  it('is never changed or deleted, even with access overridden', async () => {
    expect(() => run(neverChange, { data: {}, operation: 'update' })).toThrow(APIError)
    expect(() => run(neverChange, { data: {}, operation: 'update' })).toThrow(
      LEDGER_MESSAGES.changed,
    )
    const data = { channel: 'web' }
    expect(run(neverChange, { data, operation: 'create' })).toBe(data)
    expect(() => run(neverDelete, {})).toThrow(LEDGER_MESSAGES.deleted)
  })
})

describe('a consent text', () => {
  it('takes the next number for its purpose and language', async () => {
    payload.find.mockResolvedValue({ docs: [{ version: 2 }] })
    expect(
      await run(numberVersion, {
        data: { purpose: 'marketingEmail', text: 'Fake text' },
        operation: 'create',
        req: req(),
      }),
    ).toMatchObject({ version: 3, language: 'en-IN' })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'consent-versions',
        where: {
          and: [{ purpose: { equals: 'marketingEmail' } }, { language: { equals: 'en-IN' } }],
        },
        sort: '-version',
      }),
    )
    payload.find.mockResolvedValue({ docs: [] })
    expect(
      await run(numberVersion, {
        data: { purpose: 'mapStorage', language: 'gu-IN' },
        operation: 'create',
        req: req(),
      }),
    ).toMatchObject({ version: 1, language: 'gu-IN' })
  })

  it('never changes, and is never deleted, once it is in force', async () => {
    expect(isInForce({ effectiveFrom: ago(1) })).toBe(true)
    expect(isInForce({ effectiveFrom: ahead(1) })).toBe(false)
    expect(() =>
      run(keepInForce, { data: {}, operation: 'update', originalDoc: { effectiveFrom: ago(1) } }),
    ).toThrow(APIError)
    const data = { text: 'Fake text' }
    expect(
      run(keepInForce, { data, operation: 'update', originalDoc: { effectiveFrom: ahead(1) } }),
    ).toBe(data)
    payload.findByID.mockResolvedValue({ effectiveFrom: ago(1) })
    await expect(run(keepInForceOnDelete, { id: 3, req: req() })).rejects.toThrow(APIError)
    payload.findByID.mockResolvedValue({ effectiveFrom: ahead(1) })
    await expect(run(keepInForceOnDelete, { id: 3, req: req() })).resolves.toBeUndefined()
  })

  it('is named by its purpose, number and language, which never change', () => {
    expect(
      run(nameVersion, {
        data: { purpose: 'marketingEmail', version: 2, language: 'en-IN' },
        operation: 'create',
      }),
    ).toMatchObject({ title: 'Marketing email, version 2 (English)' })
    expect(
      run(nameVersion, {
        data: { purpose: 'mapStorage', text: 'Fake' },
        operation: 'update',
        originalDoc: { purpose: 'marketingWhatsapp', version: 1, language: 'gu-IN' },
      }),
    ).toMatchObject({ title: 'Marketing on WhatsApp, version 1 (Gujarati)' })
  })
})

describe('a person', () => {
  it('cannot share a verified mobile number or email with another person', async () => {
    payload.count.mockResolvedValue({ totalDocs: 1 })
    expect(
      await refusal(
        run(oneVerifiedPerson, {
          data: { mobile: '+918123456789', mobileVerifiedAt: ago(1) },
          originalDoc: { id: 5 },
          req: req(),
        }),
      ),
    ).toMatchObject({ path: 'mobile' })
    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'people',
        where: {
          and: [
            { mobile: { equals: '+918123456789' } },
            { mobileVerifiedAt: { exists: true } },
            { id: { not_equals: 5 } },
          ],
        },
      }),
    )
  })

  it('may share an unverified one, which staff merge later', async () => {
    const data = { mobile: '+918123456789', email: 'fake@example.invalid' }
    expect(await run(oneVerifiedPerson, { data, req: req() })).toBe(data)
    expect(payload.count).not.toHaveBeenCalled()
    payload.count.mockResolvedValue({ totalDocs: 0 })
    const verified = { ...data, emailVerifiedAt: ago(1) }
    expect(await run(oneVerifiedPerson, { data: verified, req: req() })).toBe(verified)
  })

  it('takes their consents still in force with them as withdrawals when deleted', async () => {
    const ended = { id: 50, purpose: 'marketingEmail', grantedAt: ago(9), withdraws: 42 }
    payload.find.mockResolvedValue({
      docs: [
        GRANT,
        { ...GRANT, id: 42, purpose: 'mapStorage' },
        ended,
        { ...GRANT, id: 43, purpose: 'bookingCommunications' },
      ],
    })
    const request = req()
    await run(withdrawConsentsOnDeletion, { id: 7, req: request })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'consents', where: { person: { equals: 7 } } }),
    )
    expect(payload.create.mock.calls.map(([args]) => args.data)).toEqual([
      { withdraws: 41, channel: 'recordDeleted' },
      { withdraws: 43, channel: 'recordDeleted' },
    ])
    for (const [args] of payload.create.mock.calls) {
      // In the deletion's own transaction, marked as the deletion's.
      expect(args).toMatchObject({
        collection: 'consents',
        context: { [RECORD_DELETED]: true },
        overrideAccess: true,
        req: request,
      })
    }
  })
})
