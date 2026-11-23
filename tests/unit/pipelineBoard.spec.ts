import { describe, expect, it } from 'vitest'

import { type BoardLead, buildBoard } from '@/components/admin/pipeline/board'
import { interimHeatOf } from '@/lib/pipeline/proposal/interim'
import { STAGES_BY_KIND } from '@/lib/pipeline/stages'

// The Pipeline board (docs/17 §3, §7, §12 C): a column per stage in the stage table's order, each
// lead in its own column, no moves from an end, and "Needs attention" listing the untouched and
// the stale, the most urgent first. Leads here are obviously fake.

const NOW = new Date('2099-03-10T06:30:00.000Z') // Tuesday, noon in India
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

let next = 0
function lead(fields: Partial<BoardLead> & Pick<BoardLead, 'stage'>): BoardLead {
  next += 1
  return {
    id: next,
    title: `Fake Co ${next} · consultancy`,
    kind: 'consultancy',
    createdAt: hoursAgo(1),
    touchedAt: null,
    stageChangedAt: null,
    lastActivityAt: null,
    closedAt: null,
    nextAction: null,
    dueOn: null,
    organisationName: `Fake Co ${next}`,
    ownerName: null,
    ...fields,
  }
}

describe('the board', () => {
  it('has a column per stage, in order, and puts each lead in its own', () => {
    const leads = [
      lead({ stage: 'new' }),
      lead({ stage: 'debriefHeld', touchedAt: hoursAgo(2), lastActivityAt: hoursAgo(2) }),
      lead({ stage: 'won', closedAt: hoursAgo(5) }),
      lead({ kind: 'partnership', stage: 'mouDrafted' }),
    ]
    const board = buildBoard('consultancy', leads, NOW, interimHeatOf)
    expect(board.columns.map((column) => column.stage)).toEqual([...STAGES_BY_KIND.consultancy])
    const where = Object.fromEntries(
      board.columns.map((column) => [column.stage, column.cards.map((card) => card.id)]),
    )
    expect(where.new).toEqual([leads[0]?.id])
    expect(where.debriefHeld).toEqual([leads[1]?.id])
    expect(where.won).toEqual([leads[2]?.id])
    // A partnership lead is on its own board only.
    expect(board.columns.flatMap((column) => column.cards).map((card) => card.id)).not.toContain(
      leads[3]?.id,
    )
    const partnership = buildBoard('partnership', leads, NOW, interimHeatOf)
    expect(partnership.columns.map((column) => column.stage)).toEqual([
      ...STAGES_BY_KIND.partnership,
    ])
  })

  it('offers every other stage of its board to an active lead and none to an ended one', () => {
    const active = lead({ stage: 'contacted', touchedAt: hoursAgo(1) })
    const ended = lead({ stage: 'lost', closedAt: hoursAgo(1) })
    const board = buildBoard('consultancy', [active, ended], NOW, interimHeatOf)
    const cards = board.columns.flatMap((column) => column.cards)
    const activeCard = cards.find((card) => card.id === active.id)
    expect(activeCard?.moves).not.toContain('contacted')
    expect(activeCard?.moves).toContain('new')
    expect(activeCard?.moves).toContain('lost')
    expect(activeCard?.moves).not.toContain('signed')
    expect(cards.find((card) => card.id === ended.id)?.moves).toEqual([])
    expect(board.columns.find((column) => column.stage === 'lost')?.final).toBe(true)
  })

  it('lists the untouched and the stale under "Needs attention", the most urgent first', () => {
    const fresh = lead({ stage: 'new', createdAt: hoursAgo(23) })
    const amber = lead({ stage: 'new', createdAt: hoursAgo(24) })
    const red = lead({ stage: 'new', createdAt: hoursAgo(48) })
    const answered = lead({ stage: 'new', createdAt: hoursAgo(60), touchedAt: hoursAgo(50) })
    const stale = lead({
      stage: 'proposalSent',
      createdAt: hoursAgo(400),
      touchedAt: hoursAgo(390),
      lastActivityAt: hoursAgo(7 * 24),
    })
    const quiet = lead({
      stage: 'contacted',
      createdAt: hoursAgo(400),
      touchedAt: hoursAgo(390),
      lastActivityAt: hoursAgo(7 * 24 - 1),
    })
    const won = lead({ stage: 'won', createdAt: hoursAgo(900), closedAt: hoursAgo(800) })
    const board = buildBoard(
      'consultancy',
      [fresh, amber, red, answered, stale, quiet, won],
      NOW,
      interimHeatOf,
    )
    expect(board.attention.map((card) => card.id)).toEqual([red.id, amber.id, stale.id])
    expect(board.attention.map((card) => card.heat.state)).toEqual([
      'untouched',
      'untouched',
      'stale',
    ])
  })
})

describe('a lead’s heat (P3, P4)', () => {
  const base = { kind: 'consultancy' as const, createdAt: hoursAgo(0) }

  it('is untouched in New from 24 hours, red from 48, until someone acts', () => {
    expect(interimHeatOf({ ...base, stage: 'new', createdAt: hoursAgo(23) }, NOW).state).toBe(
      'fine',
    )
    expect(interimHeatOf({ ...base, stage: 'new', createdAt: hoursAgo(24) }, NOW)).toMatchObject({
      state: 'untouched',
      level: 'amber',
    })
    expect(interimHeatOf({ ...base, stage: 'new', createdAt: hoursAgo(48) }, NOW)).toMatchObject({
      state: 'untouched',
      level: 'red',
    })
    expect(
      interimHeatOf({ ...base, stage: 'new', createdAt: hoursAgo(48), touchedAt: hoursAgo(1) }, NOW)
        .state,
    ).toBe('fine')
  })

  it('is stale in an active stage after seven quiet days, and never in an end', () => {
    const quietFor = (hours: number, stage: 'contacted' | 'won' | 'inConversation' | 'signed') =>
      interimHeatOf(
        {
          kind: stage === 'inConversation' || stage === 'signed' ? 'partnership' : 'consultancy',
          stage,
          createdAt: hoursAgo(1000),
          lastActivityAt: hoursAgo(hours),
        },
        NOW,
      ).state
    expect(quietFor(7 * 24 - 1, 'contacted')).toBe('fine')
    expect(quietFor(7 * 24, 'contacted')).toBe('stale')
    expect(quietFor(7 * 24, 'inConversation')).toBe('stale')
    expect(quietFor(900, 'won')).toBe('fine')
    expect(quietFor(900, 'signed')).toBe('fine')
  })
})
