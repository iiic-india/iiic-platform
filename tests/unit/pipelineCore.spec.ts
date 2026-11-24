// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { logActivity, logPlatformActivity } from '@/lib/pipeline/core/activities'
import { heatOf, needsAttentionWhere, quietSince, staleWhere } from '@/lib/pipeline/core/heat'
import { keysFor, nameKeyOf, organisationTypeFor, workDomainOf } from '@/lib/pipeline/core/match'
import { canMoveLead, isEarlier, moveLead } from '@/lib/pipeline/core/moves'
import { leadTitle, taskTitle } from '@/lib/pipeline/core/strings'
import { closeTask } from '@/lib/pipeline/core/tasks'
import { addWorkingDays, isWorkingDay } from '@/lib/pipeline/core/workingDays'
import { STAGES_BY_KIND, type LeadKind, type LeadStage } from '@/lib/pipeline/stages'

// The CRM core's pure parts (docs/17 §4, §7, §11): working days, matching keys and heat. Every
// name and address is an obviously fake test value.

/** An instant in India: 2026-11-27 is a Friday. */
const ist = (day: string, clock: string) => new Date(`${day}T${clock}:00+05:30`)

describe('working days (P1, P5, P7)', () => {
  it('counts two working days from a Friday evening to Tuesday', () => {
    expect(addWorkingDays(ist('2026-11-27', '19:00'), 2)).toBe('2026-12-01')
  })

  it('counts from the day in India, not in UTC', () => {
    // 01:30 on Saturday in India is still Friday in UTC.
    expect(addWorkingDays(new Date('2026-11-27T20:00:00Z'), 2)).toBe('2026-12-01')
    // 04:00 on Monday in India is Sunday evening in UTC.
    expect(addWorkingDays(new Date('2026-11-22T22:30:00Z'), 1)).toBe('2026-11-24')
  })

  it('counts from a Monday morning to Wednesday, and three days to Thursday', () => {
    expect(addWorkingDays(ist('2026-11-23', '09:00'), 2)).toBe('2026-11-25')
    expect(addWorkingDays(ist('2026-11-23', '09:00'), 3)).toBe('2026-11-26')
  })

  it('starts a weekend on Monday', () => {
    expect(addWorkingDays(ist('2026-11-29', '12:00'), 1)).toBe('2026-11-30')
    expect(addWorkingDays(ist('2026-11-28', '12:00'), 2)).toBe('2026-12-01')
  })

  it('skips the holidays it is given like weekends', () => {
    expect(addWorkingDays(ist('2026-11-27', '19:00'), 2, ['2026-11-30'])).toBe('2026-12-02')
    expect(isWorkingDay('2026-11-30', ['2026-11-30'])).toBe(false)
    expect(isWorkingDay('2026-11-30')).toBe(true)
    expect(isWorkingDay('2026-11-28')).toBe(false)
  })

  it('gives the day itself for no working days', () => {
    expect(addWorkingDays(ist('2026-11-28', '12:00'), 0)).toBe('2026-11-28')
  })
})

describe('matching keys (docs/17 §4)', () => {
  it('folds a name: small letters, "&" as "and", punctuation, a trailing legal form', () => {
    expect(nameKeyOf('  Fake Acme Pvt. Ltd. ')).toBe('fake acme')
    expect(nameKeyOf('FAKE ACME PRIVATE LIMITED')).toBe('fake acme')
    expect(nameKeyOf('Fake R&D Labs LLP')).toBe('fake r and d labs')
    expect(nameKeyOf('Fake-Example, Inc.')).toBe('fake example')
    expect(nameKeyOf('Fake Example Limited')).toBe('fake example')
  })

  it('keeps a name that is only a legal form', () => {
    expect(nameKeyOf('Ltd')).toBe('ltd')
    expect(nameKeyOf('Private Limited')).toBe('private limited')
  })

  it('keeps a word that only looks like a legal form inside a name', () => {
    expect(nameKeyOf('Fake Incubator Labs')).toBe('fake incubator labs')
  })

  it('takes the website’s host without www, else the work email’s domain', () => {
    expect(
      keysFor({ name: 'Fake Acme', website: 'https://www.acme.example/about', email: null }),
    ).toEqual({ domain: 'acme.example', nameKey: 'fake acme' })
    expect(keysFor({ name: 'Fake Acme', email: 'someone@Acme.Example' })).toEqual({
      domain: 'acme.example',
      nameKey: 'fake acme',
    })
  })

  it('never matches by a free mail service’s domain', () => {
    expect(keysFor({ name: 'Fake Acme', email: 'someone@gmail.com' }).domain).toBeNull()
    expect(workDomainOf('someone@yahoo.co.in')).toBeNull()
    expect(workDomainOf('not an address')).toBeNull()
  })

  it('pairs a Team Map with a business and a partnership with an institution', () => {
    expect(organisationTypeFor('consultancy')).toBe('business')
    expect(organisationTypeFor('partnership')).toBe('institution')
  })
})

describe('heat (P3, P4; docs/17 §7)', () => {
  const made = ist('2026-11-23', '10:00')
  const later = (hours: number) => new Date(made.getTime() + hours * 60 * 60 * 1000)
  const lead = (
    kind: LeadKind,
    stage: LeadStage,
    extra: { touchedAt?: string; stageChangedAt?: string; lastActivityAt?: string } = {},
  ) => ({ kind, stage, createdAt: made.toISOString(), ...extra })

  it('keeps a new lead fine for its first 23 hours', () => {
    expect(heatOf(lead('consultancy', 'new'), later(23))).toEqual({ state: 'fine' })
  })

  it('marks a new lead untouched: amber at 24 hours, red at 48', () => {
    expect(heatOf(lead('consultancy', 'new'), later(24))).toEqual({
      state: 'untouched',
      level: 'amber',
      since: made,
    })
    expect(heatOf(lead('partnership', 'new'), later(47))).toMatchObject({ level: 'amber' })
    expect(heatOf(lead('partnership', 'new'), later(48))).toMatchObject({ level: 'red' })
    expect(heatOf(lead('consultancy', 'new'), later(24 * 7))).toMatchObject({ level: 'red' })
  })

  it('keeps a new lead someone on the staff acted on fine, however old', () => {
    const touched = lead('consultancy', 'new', { touchedAt: later(1).toISOString() })
    expect(heatOf(touched, later(24 * 30))).toEqual({ state: 'fine' })
  })

  it('marks an active lead stale once its last activity is seven days old', () => {
    const quiet = lead('consultancy', 'contacted', { lastActivityAt: made.toISOString() })
    expect(heatOf(quiet, later(24 * 7 - 1))).toEqual({ state: 'fine' })
    expect(heatOf(quiet, later(24 * 7))).toEqual({ state: 'stale', since: made })
    const partnership = lead('partnership', 'mouDrafted', { lastActivityAt: made.toISOString() })
    expect(heatOf(partnership, later(24 * 8))).toMatchObject({ state: 'stale' })
  })

  it('counts a quiet spell from the stage change, else the making, when nothing was logged', () => {
    const moved = lead('consultancy', 'debriefHeld', { stageChangedAt: later(48).toISOString() })
    expect(quietSince(moved)).toEqual(later(48))
    expect(heatOf(moved, later(24 * 8))).toEqual({ state: 'fine' })
    expect(heatOf(moved, later(24 * 9))).toEqual({ state: 'stale', since: later(48) })
    expect(heatOf(lead('consultancy', 'proposalSent'), later(24 * 7))).toMatchObject({
      state: 'stale',
    })
  })

  it('keeps every final stage fine', () => {
    for (const kind of ['consultancy', 'partnership'] as const) {
      for (const stage of STAGES_BY_KIND[kind].filter((value) =>
        ['won', 'lost', 'signed', 'closed'].includes(value),
      )) {
        expect(heatOf(lead(kind, stage), later(24 * 60))).toEqual({ state: 'fine' })
      }
    }
  })

  it('asks the database the same question: the stale stages of each kind, seven days quiet', () => {
    const where = JSON.stringify(staleWhere(later(24 * 7)))
    expect(where).toContain('"contacted"')
    expect(where).toContain('"mouDrafted"')
    expect(where).not.toContain('"new"')
    expect(where).toContain(made.toISOString())
    expect(JSON.stringify(needsAttentionWhere(later(24)))).toContain('touchedAt')
  })
})

describe('names the platform gives', () => {
  it('names a lead by its organisation and kind, never by a person', () => {
    expect(leadTitle('Fake Acme', 'consultancy')).toBe('Fake Acme · Consultancy')
    expect(leadTitle(null, 'partnership')).toBe('No organisation yet · Partnership')
  })

  it('names a first-reply task by its kind', () => {
    expect(taskTitle('firstReply')).toBe('Reply to the request')
  })
})

describe('moves along a board (docs/17 §3)', () => {
  it('moves an active stage anywhere on its own board, and an end nowhere', () => {
    expect(canMoveLead('consultancy', 'new', 'debriefHeld')).toBe(true)
    expect(canMoveLead('consultancy', 'proposalSent', 'contacted')).toBe(true)
    expect(canMoveLead('consultancy', 'new', 'lost')).toBe(true)
    expect(canMoveLead('consultancy', 'won', 'new')).toBe(false)
    expect(canMoveLead('consultancy', 'new', 'signed')).toBe(false)
    expect(canMoveLead('partnership', 'closed', 'inConversation')).toBe(false)
  })

  it('knows which stages come earlier, for the platform’s own moves (P2, P5)', () => {
    expect(isEarlier('consultancy', 'new', 'contacted')).toBe(true)
    expect(isEarlier('consultancy', 'teamMapScheduled', 'contacted')).toBe(false)
    expect(isEarlier('consultancy', 'contacted', 'contacted')).toBe(false)
  })
})

describe('staff writes need the role and the code (CLAUDE.md #6)', () => {
  const OPERATOR = 7
  /** A request from a fake member of the staff, and a database that holds nothing. */
  const requestBy = (user: Record<string, unknown> | null) => {
    const findByID = vi.fn(async () => null)
    const req = { user, payload: { findByID } } as unknown as PayloadRequest
    return { req, findByID }
  }
  const operator = (strategy?: string) => ({
    id: OPERATOR,
    collection: 'users',
    roles: ['operator'],
    ...(strategy ? { _strategy: strategy } : {}),
  })
  const finance = { id: OPERATOR, collection: 'users', roles: ['finance'], _strategy: 'totp' }

  it('refuses a move, an entry or a closed task without the code, in the wrong role, or as someone else', async () => {
    const deactivated = { ...operator('totp'), active: false }
    for (const user of [null, operator(), operator('local-jwt'), finance, deactivated]) {
      const { req, findByID } = requestBy(user)
      const by = OPERATOR
      expect(await moveLead(req, { leadId: 1, to: 'contacted', by })).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      })
      expect(await logActivity(req, { leadId: 1, type: 'note', body: 'Fake', by })).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      })
      expect(await closeTask(req, { taskId: 1, status: 'done', by })).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      })
      expect(findByID).not.toHaveBeenCalled()
    }
    const { req } = requestBy(operator('totp'))
    expect(await moveLead(req, { leadId: 1, to: 'contacted', by: OPERATOR + 1 })).toMatchObject({
      error: { code: 'not-allowed' },
    })
  })

  it('refuses the platform’s own kinds of entry to the staff', async () => {
    const { req } = requestBy(operator('totp'))
    for (const type of ['stageChange', 'enquiry', 'proposal', 'booking'] as const) {
      expect(await logActivity(req, { leadId: 1, type, by: OPERATOR })).toMatchObject({
        error: { code: 'not-allowed' },
      })
    }
  })

  it('writes the platform’s own entry as the signed-in staff member’s, and only as theirs', async () => {
    for (const user of [null, operator(), finance, { ...operator('totp'), active: false }]) {
      const { req, findByID } = requestBy(user)
      expect(await logPlatformActivity(req, { leadId: 1, type: 'proposal', by: OPERATOR })).toEqual(
        { ok: false, error: { code: 'not-allowed' } },
      )
      expect(findByID).not.toHaveBeenCalled()
    }
    const { req, findByID } = requestBy(operator('totp'))
    expect(
      await logPlatformActivity(req, { leadId: 1, type: 'proposal', by: OPERATOR + 1 }),
    ).toEqual({ ok: false, error: { code: 'not-allowed' } })
    // Theirs, of a platform type: through to the record (none here).
    expect(await logPlatformActivity(req, { leadId: 1, type: 'proposal', by: OPERATOR })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(findByID).toHaveBeenCalledTimes(1)
  })

  it('lets an operator with the code through to the record', async () => {
    const { req, findByID } = requestBy(operator('totp'))
    expect(await moveLead(req, { leadId: 1, to: 'contacted', by: OPERATOR })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await logActivity(req, { leadId: 1, type: 'call', by: OPERATOR })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await closeTask(req, { taskId: 1, status: 'done', by: OPERATOR })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(findByID).toHaveBeenCalledTimes(3)
  })
})
