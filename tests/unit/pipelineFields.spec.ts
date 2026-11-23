// @vitest-environment node
import type { TextFieldSingleValidation } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  domainOf,
  MESSAGES,
  toWebsite,
  validateEndReason,
  validateGstin,
  validatePostalCode,
  validateStage,
  validateWebsite,
} from '@/lib/pipeline/fields'
import {
  FINAL_STAGES,
  LEAD_KINDS,
  LEAD_STAGES,
  REASON_STAGES,
  STAGE_MOVES,
  STAGES_BY_KIND,
  STALE_STAGES,
  UNTOUCHED_STAGE,
} from '@/lib/pipeline/stages'
import { PROPOSAL_MOVES, PROPOSAL_STATUSES, TASK_MOVES } from '@/lib/pipeline/values'

// The pipeline's field checks and its tables (docs/17 §2–§5): shapes only, no business rules.

const textOptions = {
  req: { t: (key: string) => key, payload: { config: {} } },
} as unknown as Parameters<TextFieldSingleValidation>[1]

const run = (validate: TextFieldSingleValidation, value: unknown) =>
  validate(value as string, textOptions)

const withSiblings = (siblingData: Record<string, unknown>) => ({ siblingData }) as never

describe('websites', () => {
  it('reads an address as typed and writes it in one form', () => {
    expect(toWebsite('Example.test')).toBe('https://example.test')
    expect(toWebsite(' http://www.Example.test/about/ ')).toBe('http://www.example.test/about')
    expect(toWebsite('https://example.co.in/?ref=1')).toBe('https://example.co.in?ref=1')
  })

  it('refuses what is not a public web address', () => {
    for (const typed of [
      '',
      'localhost',
      'ftp://example.test',
      'javascript:alert(1)',
      'https://user:pass@example.test',
      'https://example.test:8080',
      'http://10.0.0.1',
      'not a site',
    ]) {
      expect(toWebsite(typed), typed).toBeNull()
    }
  })

  it('matches by host, without www', () => {
    expect(domainOf('https://www.example.test/team')).toBe('example.test')
    expect(domainOf('nothing')).toBeNull()
  })

  it('checks the field as typed and leaves an empty one alone', async () => {
    expect(await run(validateWebsite, 'example.test')).toBe(true)
    expect(await run(validateWebsite, '')).toBe(true)
    expect(await run(validateWebsite, 'localhost')).toBe(MESSAGES.website)
  })
})

describe('billing details', () => {
  it('accepts a GSTIN in its form, in any case, and refuses anything else', async () => {
    expect(await run(validateGstin, '24ABCDE1234F1Z5')).toBe(true)
    expect(await run(validateGstin, '24abcde1234f1z5')).toBe(true)
    expect(await run(validateGstin, '24ABCDE1234F1Y5')).toBe(MESSAGES.gstin)
    expect(await run(validateGstin, '')).toBe(true)
  })

  it('accepts a six-digit PIN code that does not start with 0', async () => {
    expect(await run(validatePostalCode, '380059')).toBe(true)
    expect(await run(validatePostalCode, '080059')).toBe(MESSAGES.postalCode)
    expect(await run(validatePostalCode, '38005')).toBe(MESSAGES.postalCode)
  })
})

describe('a lead’s stage and its end', () => {
  it('keeps each lead on its own board', () => {
    expect(validateStage('teamMapDone', withSiblings({ kind: 'consultancy' }))).toBe(true)
    expect(validateStage('teamMapDone', withSiblings({ kind: 'partnership' }))).toBe(MESSAGES.stage)
    expect(validateStage('mouDrafted', withSiblings({ kind: 'partnership' }))).toBe(true)
    expect(validateStage('new', withSiblings({ kind: 'partnership' }))).toBe(true)
  })

  it('asks for a reason when a lead is lost or closed, and only then', () => {
    for (const stage of REASON_STAGES) {
      expect(validateEndReason('', withSiblings({ stage }))).toBe(MESSAGES.reason)
      expect(validateEndReason('  ', withSiblings({ stage }))).toBe(MESSAGES.reason)
      expect(validateEndReason('Chose another firm', withSiblings({ stage }))).toBe(true)
    }
    expect(validateEndReason('', withSiblings({ stage: 'won' }))).toBe(true)
    expect(validateEndReason(undefined, withSiblings({ stage: 'contacted' }))).toBe(true)
  })
})

describe('the tables (docs/03 F5, F12; docs/17 §3, §5)', () => {
  const all = LEAD_STAGES.map((stage) => stage.value) as string[]

  it('builds each board from the one list of stages, starting at New', () => {
    for (const { value: kind } of LEAD_KINDS) {
      const board = STAGES_BY_KIND[kind] as readonly string[]
      expect(board[0]).toBe('new')
      for (const stage of board) expect(all).toContain(stage)
    }
    expect(STAGES_BY_KIND.consultancy).toEqual([
      'new',
      'contacted',
      'teamMapScheduled',
      'teamMapDone',
      'debriefHeld',
      'proposalSent',
      'won',
      'lost',
    ])
    expect(STAGES_BY_KIND.partnership).toEqual([
      'new',
      'inConversation',
      'mouDrafted',
      'signed',
      'closed',
    ])
  })

  it('lets an active stage move anywhere on its own board and a final one nowhere', () => {
    for (const { value: kind } of LEAD_KINDS) {
      const board = STAGES_BY_KIND[kind] as readonly string[]
      for (const from of board) {
        const moves = (STAGE_MOVES[kind] as Record<string, readonly string[]>)[from] ?? ['none']
        if ((FINAL_STAGES as readonly string[]).includes(from)) {
          expect(moves, `${kind} ${from}`).toEqual([])
        } else {
          expect([...moves].sort(), `${kind} ${from}`).toEqual(
            board.filter((to) => to !== from).sort(),
          )
        }
      }
    }
  })

  it('ends every board, and asks a reason only of an end', () => {
    for (const { value: kind } of LEAD_KINDS) {
      const ends = (STAGES_BY_KIND[kind] as readonly string[]).filter((stage) =>
        (FINAL_STAGES as readonly string[]).includes(stage),
      )
      expect(ends.length, kind).toBe(2)
    }
    for (const stage of REASON_STAGES) expect(FINAL_STAGES).toContain(stage)
  })

  it('watches New for a first reply and the other active stages for staleness', () => {
    for (const { value: kind } of LEAD_KINDS) {
      const active = (STAGES_BY_KIND[kind] as readonly string[]).filter(
        (stage) => !(FINAL_STAGES as readonly string[]).includes(stage),
      )
      expect([UNTOUCHED_STAGE, ...STALE_STAGES[kind]].sort(), kind).toEqual([...active].sort())
    }
  })

  it('keeps a proposal’s and a task’s moves within their own states, with final ends', () => {
    const statuses = PROPOSAL_STATUSES.map((status) => status.value) as string[]
    for (const [from, moves] of Object.entries(PROPOSAL_MOVES)) {
      expect(statuses).toContain(from)
      for (const to of moves) expect(statuses).toContain(to)
    }
    expect(PROPOSAL_MOVES.accepted).toEqual([])
    expect(PROPOSAL_MOVES.declined).toEqual([])
    expect(TASK_MOVES.done).toEqual([])
    expect(TASK_MOVES.cancelled).toEqual([])
  })
})
