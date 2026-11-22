// @vitest-environment node
import type { Field, GlobalConfig } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  checkDetail,
  GSTIN,
  IFSC,
  revalidateAfterChange,
  Settings,
  UDYAM,
} from '@/globals/Settings'
import { FLAGS_OFF, toFlags } from '@/lib/settings/flags'
import { NO_LEGAL_INFORMATION } from '@/lib/settings/legal'
import {
  getFlags,
  getLegalInformation,
  legalInformationFor,
  pricesArePublic,
} from '@/lib/settings/read'
import { revalidateSettings, SETTINGS_TAG } from '@/lib/settings/revalidate'
import { readFlags, readLegalInformation, readQuietHours } from '@/lib/settings/source'

// The settings global (docs/04 `settings`) and what reads it: the flags (D-21, D-24), the helper
// M3 asks whether prices are public, the cache by the settings' tag (docs/12 §1, §4), and the
// checks on what the owner types. The database and Next.js's cache are faked: the cache is a
// pass-through that records its key and tags.
const { findGlobal, cacheCalls, revalidateTag } = vi.hoisted(() => ({
  findGlobal: vi.fn(),
  cacheCalls: [] as unknown[][],
  revalidateTag: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ findGlobal }) }))
vi.mock('next/cache', () => ({
  revalidateTag,
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return fn
  },
}))

beforeEach(() => {
  findGlobal.mockReset()
  revalidateTag.mockReset()
  cacheCalls.length = 0
})

const payload = () => ({ findGlobal }) as never

describe('the feature flags', () => {
  it('are off unless the owner turned them on', () => {
    for (const settings of [undefined, null, {}, { flags: null }, { flags: {} }]) {
      expect(toFlags(settings)).toEqual(FLAGS_OFF)
    }
    expect(toFlags({ flags: { mapEnabled: 'yes', accountsEnabled: 1 } })).toEqual(FLAGS_OFF)
    expect(toFlags({ flags: { mapEnabled: true } }).mapEnabled).toBe(true)
  })

  it('never take payment at booking without published prices (D-21, D-24)', () => {
    expect(toFlags({ flags: { payAtBooking: true } }).payAtBooking).toBe(false)
    expect(toFlags({ flags: { payAtBooking: true, pricesPublic: true } })).toMatchObject({
      pricesPublic: true,
      payAtBooking: true,
    })
  })

  it('are read alone from the settings, past the owner-only rule', async () => {
    findGlobal.mockResolvedValue({ flags: { pricesPublic: true } })
    expect(await readFlags(payload())).toMatchObject({ pricesPublic: true })
    expect(findGlobal).toHaveBeenCalledWith({
      slug: 'settings',
      select: { flags: true },
      depth: 0,
      overrideAccess: true,
    })
  })
})

describe('whether prices are public (D-21)', () => {
  it('says no until the owner turns prices on, and asks the cached flags', async () => {
    findGlobal.mockResolvedValue({})
    expect(await pricesArePublic()).toBe(false)
    findGlobal.mockResolvedValue({ flags: { pricesPublic: false, payAtBooking: true } })
    expect(await pricesArePublic()).toBe(false)
    findGlobal.mockResolvedValue({ flags: { pricesPublic: true } })
    expect(await pricesArePublic()).toBe(true)
    // Cached by the settings' tag, which the global marks stale when it changes.
    expect(cacheCalls.at(-1)).toEqual([['settings-flags'], { tags: [SETTINGS_TAG] }])
  })

  it('reads the flags through the same cache as the rest of the server', async () => {
    findGlobal.mockResolvedValue({ flags: { bridgesEnabled: true } })
    expect((await getFlags()).bridgesEnabled).toBe(true)
  })
})

describe('the legal information the pages read', () => {
  it('is read with its fields only, and cached by the settings’ tag', async () => {
    findGlobal.mockResolvedValue({ legal: { legalName: 'Fake Proprietor Name' } })
    expect((await getLegalInformation()).legalName).toBe('Fake Proprietor Name')
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'settings',
        select: { legal: true, darkPatternAudits: true },
        overrideAccess: true,
      }),
    )
    expect(cacheCalls.at(-1)).toEqual([['settings-legal'], { tags: [SETTINGS_TAG] }])
  })

  it('is read only for a page that shows the legal information section', async () => {
    findGlobal.mockResolvedValue({})
    expect(await legalInformationFor([{ blockType: 'hero' }])).toBeUndefined()
    expect(findGlobal).not.toHaveBeenCalled()
    expect(await legalInformationFor([{ blockType: 'hero' }, { blockType: 'legal' }])).toEqual(
      NO_LEGAL_INFORMATION,
    )
  })

  it('reads a global nobody has saved as empty', async () => {
    findGlobal.mockResolvedValue({})
    expect(await readLegalInformation(payload())).toEqual(NO_LEGAL_INFORMATION)
  })
})

describe('the quiet hours as the server reads them', () => {
  it('are 21:00 to 08:00 until the owner changes them', async () => {
    findGlobal.mockResolvedValue({})
    expect(await readQuietHours(payload())).toEqual({ start: '21:00', end: '08:00' })
    findGlobal.mockResolvedValue({ quietHours: { start: '22:30', end: '07:00' } })
    expect(await readQuietHours(payload())).toEqual({ start: '22:30', end: '07:00' })
    findGlobal.mockResolvedValue({ quietHours: { start: '25:00', end: null } })
    expect(await readQuietHours(payload())).toEqual({ start: '21:00', end: '08:00' })
  })
})

describe('a change to the settings', () => {
  it('marks the cached settings stale, so pages show it at the next request', () => {
    const doc = { flags: {} }
    expect(revalidateAfterChange({ doc } as never)).toBe(doc)
    expect(revalidateTag).toHaveBeenCalledWith(SETTINGS_TAG, { expire: 0 })
  })

  it('is no error outside a request, where there is no cache to mark', () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag settings')
    })
    expect(() => revalidateSettings()).not.toThrow()
    revalidateTag.mockImplementation(() => {
      throw new Error('fake: something else')
    })
    expect(() => revalidateSettings()).toThrow('fake')
  })
})

/** A field's own check, as these tests call it. */
type Check = (value: unknown, options: unknown) => unknown

/** Every field of the global, by its path, such as legal.gstin. */
function fieldsByPath(fields: Field[], prefix = ''): Map<string, Field> {
  const found = new Map<string, Field>()
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs)
        fieldsByPath(tab.fields, prefix).forEach((v, k) => found.set(k, v))
    } else if (field.type === 'row' || field.type === 'collapsible') {
      fieldsByPath(field.fields, prefix).forEach((v, k) => found.set(k, v))
    } else if ('name' in field) {
      found.set(`${prefix}${field.name}`, field)
      if (field.type === 'group' || field.type === 'array') {
        fieldsByPath(field.fields, `${prefix}${field.name}.`).forEach((v, k) => found.set(k, v))
      }
    }
  }
  return found
}

describe('the settings global', () => {
  const fields = fieldsByPath((Settings as GlobalConfig).fields)

  it('holds docs/04’s fields: legal information, bank details, booking defaults, quiet hours, flags, processors and the audit', () => {
    for (const path of [
      'legal.legalName',
      'legal.tradeName',
      'legal.address',
      'legal.gstin',
      'legal.gstStatus',
      'legal.udyam',
      'legal.customerCare.email',
      'legal.customerCare.phone',
      'legal.grievanceOfficer.name',
      'legal.grievanceOfficer.designation',
      'legal.grievanceOfficer.email',
      'legal.grievanceOfficer.phone',
      'legal.certIn.name',
      'legal.certIn.email',
      'legal.certIn.phone',
      'bank.accountName',
      'bank.accountNumber',
      'bank.ifsc',
      'booking.noticeHours',
      'booking.horizonDays',
      'booking.holdMinutes',
      'quietHours.start',
      'quietHours.end',
      'flags.pricesPublic',
      'flags.payAtBooking',
      'flags.mapEnabled',
      'flags.accountsEnabled',
      'flags.bridgesEnabled',
      'processors.name',
      'processors.holds',
      'processors.location',
      'processors.contract',
      'darkPatternAudits.auditedOn',
      'darkPatternAudits.certificate',
    ]) {
      expect(fields.has(path), path).toBe(true)
    }
  })

  it('starts with every flag off and quiet hours from 21:00 to 08:00, India time', () => {
    for (const flag of Object.keys(FLAGS_OFF)) {
      expect((fields.get(`flags.${flag}`) as { defaultValue?: unknown }).defaultValue, flag).toBe(
        false,
      )
    }
    expect((fields.get('quietHours.start') as { defaultValue?: unknown }).defaultValue).toBe(
      '21:00',
    )
    expect((fields.get('quietHours.end') as { defaultValue?: unknown }).defaultValue).toBe('08:00')
    expect((fields.get('booking.noticeHours') as { defaultValue?: unknown }).defaultValue).toBe(12)
    expect((fields.get('booking.horizonDays') as { defaultValue?: unknown }).defaultValue).toBe(14)
    expect((fields.get('booking.holdMinutes') as { defaultValue?: unknown }).defaultValue).toBe(10)
  })

  it('refuses payment at booking while prices are hidden (D-21, D-24)', async () => {
    const validate = (fields.get('flags.payAtBooking') as { validate: Check }).validate
    expect(await validate(true, { siblingData: { pricesPublic: false } })).toMatch(
      /Prices are public/,
    )
    expect(await validate(true, { siblingData: { pricesPublic: true } })).toBe(true)
    expect(await validate(false, { siblingData: {} })).toBe(true)
  })

  it('refuses a placeholder typed into a detail: the site draws one while it is empty', () => {
    expect(checkDetail('[[TODO: the GSTIN, I-05]]')).toMatch(/placeholder/)
    expect(checkDetail('Fake ]] name')).toMatch(/placeholder/)
    expect(checkDetail('Fake Proprietor Name')).toBe(true)
    expect(checkDetail('')).toBe(true)
    expect(checkDetail(null)).toBe(true)
  })

  it('knows the forms of the GSTIN, the Udyam number and the IFSC', () => {
    expect(GSTIN.test('24AAAAA0000A1Z5')).toBe(true)
    for (const bad of ['24AAAAA0000A1Z', '24aaaaa0000a1z5', 'AAAAAA0000A1Z5X', '24AAAAA0000A0Z5']) {
      expect(GSTIN.test(bad), bad).toBe(false)
    }
    expect(UDYAM.test('UDYAM-GJ-00-0000000')).toBe(true)
    expect(UDYAM.test('UDYAM-GJ-0-0000000')).toBe(false)
    expect(IFSC.test('FAKE0000000')).toBe(true)
    expect(IFSC.test('FAKE1000000')).toBe(false)
    expect(checkDetail('24AAAAA0000A1Z', { pattern: GSTIN, message: 'fake' })).toBe('fake')
  })

  it('checks a time of day for the quiet hours', async () => {
    const validate = (fields.get('quietHours.start') as { validate: Check }).validate
    const options = { req: { t: (key: string) => key, payload: { config: {} } }, required: true }
    expect(await validate('21:00', options)).toBe(true)
    for (const bad of ['9 PM', '24:00', '21:60', '2100']) {
      expect(await validate(bad, options), bad).toMatch(/HH:MM/)
    }
  })

  it('is for owners only, and hidden from everyone else in the admin', () => {
    const hidden = Settings.admin?.hidden as (args: { user: unknown }) => boolean
    expect(hidden({ user: { roles: ['owner'], active: true } })).toBe(false)
    for (const role of ['operator', 'practitioner', 'editor', 'finance']) {
      expect(hidden({ user: { roles: [role], active: true } }), role).toBe(true)
    }
  })
})
