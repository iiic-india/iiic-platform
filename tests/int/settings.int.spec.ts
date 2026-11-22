import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { loadPlaceholderReport } from '@/lib/content/placeholderReport'
import { FLAGS_OFF } from '@/lib/settings/flags'
import { readFlags, readLegalInformation, readQuietHours } from '@/lib/settings/source'
import type { PlatformSettings, User } from '@/payload-types'
import config from '@/payload.config'

// The settings global (docs/04 `settings`) against the real database: owners only, the flags'
// rule (D-21, D-24), what the owner types as it is stored, the audit log, and the legal
// information reaching the footer, /legal and the placeholders report (D-56). The settings are
// cleared again at the end, so the site shows its placeholders as before. Obviously fake details;
// the mobile number is libphonenumber's own example.
let payload: Payload
const email = (label: string) => `int.settings.${label}@example.invalid`
const PASSWORD = 'test-only-password-settings'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User

/** Everything this file sets, as nobody has set it. */
const CLEARED = {
  legal: {
    legalName: null,
    tradeName: null,
    address: null,
    gstin: null,
    gstStatus: null,
    udyam: null,
    customerCare: { email: null, phone: null, hours: null },
    grievanceOfficer: { name: null, designation: null, email: null, phone: null },
    certIn: { name: null, email: null, phone: null },
  },
  flags: { ...FLAGS_OFF },
  quietHours: { start: '21:00', end: '08:00' },
} as unknown as PlatformSettings

const update = (data: Record<string, unknown>, user = staff.owner) =>
  payload.updateGlobal({
    slug: 'settings',
    data: data as Partial<PlatformSettings>,
    user: verified(user),
    overrideAccess: false,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.settings.' } } })
  // The owner first: on an empty table the first account becomes the owner anyway.
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
})

afterAll(async () => {
  await payload.updateGlobal({ slug: 'settings', data: CLEARED })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.settings.' } } })
})

describe('the settings (docs/04: owner only)', () => {
  it('are read and changed by owners, and by no other role or visitor', async () => {
    for (const role of ROLES) {
      const read = payload.findGlobal({
        slug: 'settings',
        user: verified(staff[role]),
        overrideAccess: false,
      })
      const change = update({ quietHours: { start: '21:00', end: '08:00' } }, staff[role])
      if (role === 'owner') {
        await expect(read, role).resolves.toBeTruthy()
        await expect(change, role).resolves.toBeTruthy()
      } else {
        await expect(read, role).rejects.toThrow()
        await expect(change, role).rejects.toThrow()
      }
    }
    await expect(payload.findGlobal({ slug: 'settings', overrideAccess: false })).rejects.toThrow()
  })

  it('keep every flag off and quiet hours at 21:00 to 08:00 until the owner changes them', async () => {
    await payload.updateGlobal({ slug: 'settings', data: CLEARED })
    expect(await readFlags(payload)).toEqual(FLAGS_OFF)
    expect(await readQuietHours(payload)).toEqual({ start: '21:00', end: '08:00' })
  })

  it('refuse payment at booking while prices are hidden (D-21, D-24)', async () => {
    await expect(update({ flags: { payAtBooking: true } })).rejects.toThrow()
    await update({ flags: { pricesPublic: true, payAtBooking: true } })
    expect(await readFlags(payload)).toMatchObject({ pricesPublic: true, payAtBooking: true })
    await update({ flags: { ...FLAGS_OFF } })
    expect(await readFlags(payload)).toEqual(FLAGS_OFF)
  })

  it('keep a time of day for the quiet hours, and refuse anything else', async () => {
    await expect(update({ quietHours: { start: '9 PM', end: '08:00' } })).rejects.toThrow()
    await update({ quietHours: { start: '22:00', end: '07:30' } })
    expect(await readQuietHours(payload)).toEqual({ start: '22:00', end: '07:30' })
    await update({ quietHours: { start: '21:00', end: '08:00' } })
  })
})

describe('the legal information', () => {
  it('stores registration numbers in capitals and phones in E.164, and refuses a placeholder', async () => {
    const saved = await update({
      legal: {
        gstin: '24aaaaa0000a1z5',
        grievanceOfficer: { phone: '81234 56789' },
      },
    })
    expect(saved.legal?.gstin).toBe('24AAAAA0000A1Z5')
    expect(saved.legal?.grievanceOfficer?.phone).toBe('+918123456789')
    await expect(
      update({ legal: { legalName: '[[TODO: the proprietor’s legal name, I-26]]' } }),
    ).rejects.toThrow()
    await expect(update({ legal: { gstin: '24AAAAA0000A1Z' } })).rejects.toThrow()
  })

  it('is recorded in the audit log, field by field, never by value', async () => {
    await update({ legal: { tradeName: 'Fake Trade Name (int.settings)' } })
    const { docs } = await payload.find({
      collection: 'audit-log',
      where: { entity: { equals: 'settings' } },
      sort: '-at',
      limit: 1,
      overrideAccess: true,
    })
    expect(docs[0]).toMatchObject({
      action: 'update',
      actorId: String(staff.owner.id),
      changed: 'legal.tradeName',
    })
    expect(JSON.stringify(docs[0])).not.toContain('Fake Trade Name')
  })

  it('reaches the footer and /legal, and the report lists only what is still missing', async () => {
    const footer = (report: Awaited<ReturnType<typeof loadPlaceholderReport>>) =>
      report.missing
        .filter((row) => row.section === 'Footer')
        .map((row) => row.id)
        .sort()
    await update({ legal: CLEARED.legal })
    expect(footer(await loadPlaceholderReport(payload, verified(staff.editor), '/admin'))).toEqual([
      'I-05',
      'I-21',
      'I-26',
      'I-30',
    ])

    await update({
      legal: {
        legalName: 'Fake Proprietor Name',
        gstin: '24AAAAA0000A1Z5',
        grievanceOfficer: {
          name: 'Fake Officer',
          designation: 'Fake Designation',
          email: 'grievance.fake@example.invalid',
        },
      },
    })
    const legal = await readLegalInformation(payload)
    expect(legal).toMatchObject({
      legalName: 'Fake Proprietor Name',
      gstin: '24AAAAA0000A1Z5',
      grievanceOfficer: { name: 'Fake Officer', designation: 'Fake Designation' },
    })
    const after = await loadPlaceholderReport(payload, verified(staff.editor), '/admin')
    // The affiliation statement waits on the lawyer, not on the settings (D-20).
    expect(footer(after)).toEqual(['I-30'])
    // /legal still waits for what the owner has not entered: the trade name, the address, the
    // CERT-In contact and the audit, unless a page in the admin has replaced the starter page.
    const legalPage = after.missing.filter((row) => row.page.path === '/legal')
    if (legalPage.length > 0) {
      expect(legalPage.map((row) => row.id).sort()).toEqual(['I-22', 'I-26', 'I-27', 'I-33'])
    }
    await update({ legal: CLEARED.legal })
  })
})
