import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOARD_COPY, LEAD_STAGE_COPY, MOVE_MESSAGES } from '@/components/admin/pipeline/copy'

// "Move to stage" on a lead's own page (docs/05 Pipeline; docs/17 §3; M7): the user, the code and
// the role are checked before the lead is read; the office sees the lead's stage and the moves
// STAGE_MOVES allows; the control is no form of its own, since it sits inside the lead's form, and
// calls the board's endpoint, which checks again. Every id and name is fake.

const refresh = vi.fn()
const toastSuccess = vi.fn()

// Payload's admin UI loads styles only the Next.js build can handle: a plain button stands in.
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
    type?: 'button' | 'submit'
  }) => (
    <button type={type === 'submit' ? 'submit' : 'button'} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  toast: { success: (message: string) => toastSuccess(message) },
  useConfig: () => ({ config: { routes: { admin: '/admin', api: '/api' }, serverURL: '' } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const { LeadStage: LeadStageField } = await import('@/components/admin/pipeline/LeadStage')
/** The server component as the admin calls it: a function of its props. */
const LeadStage = LeadStageField as unknown as (props: never) => Promise<ReactElement | null>
const { LeadStagePanel } = await import('@/components/admin/pipeline/LeadStagePanel')

type Staff = { id: number; roles: string[]; active?: boolean; _strategy?: string } | null

function serverProps(user: Staff, lead: { kind: string; stage: string } | null) {
  const findByID = vi.fn(async () => lead)
  return {
    findByID,
    props: { id: 7, payload: { findByID }, req: { user } } as never,
  }
}

const officer = (roles: string[], strategy = 'totp'): Staff => ({
  id: 1,
  roles,
  active: true,
  _strategy: strategy,
})

beforeEach(() => {
  refresh.mockClear()
  toastSuccess.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the stage panel on a lead’s page', () => {
  it('reads nothing and shows nothing to anyone but the office with its code', async () => {
    for (const user of [
      null,
      officer(['editor']),
      officer(['practitioner']),
      officer(['finance']),
      officer(['owner'], 'local-jwt'),
      { ...officer(['owner']), active: false } as Staff,
    ]) {
      const { findByID, props } = serverProps(user, { kind: 'consultancy', stage: 'new' })
      expect(await LeadStage(props), JSON.stringify(user)).toBeNull()
      expect(findByID).not.toHaveBeenCalled()
    }
  })

  it('shows the office the stage and the moves its board allows, read with its own access', async () => {
    const { findByID, props } = serverProps(officer(['operator']), {
      kind: 'consultancy',
      stage: 'contacted',
    })
    render((await LeadStage(props)) as ReactElement)
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'leads', id: 7, overrideAccess: false }),
    )
    expect(screen.getByRole('heading', { name: LEAD_STAGE_COPY.heading })).toBeTruthy()
    expect(screen.getByText('Contacted')).toBeTruthy()
    const options = screen
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'))
      .filter(Boolean)
    expect(options).not.toContain('contacted')
    expect(options).toContain('lost')
    expect(options).not.toContain('signed')
    // Not a form inside the lead's own form.
    expect(document.querySelector('form')).toBeNull()
  })

  it('says an ended lead moves nowhere', async () => {
    const { props } = serverProps(officer(['owner']), { kind: 'consultancy', stage: 'won' })
    render((await LeadStage(props)) as ReactElement)
    expect(screen.getByText(BOARD_COPY.move.final)).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('moving a lead from its page', () => {
  const MOVES = [
    { value: 'contacted', label: 'Contacted' },
    { value: 'lost', label: 'Lost' },
  ]

  it('asks why for Lost, sends the move to the board’s endpoint and reads the page again', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: 7, stage: 'lost', label: 'Lost' }), {}),
    )
    vi.stubGlobal('fetch', fetch)
    render(<LeadStagePanel leadId={7} moves={MOVES} reasonStages={['lost', 'closed']} />)
    fireEvent.change(screen.getByLabelText(BOARD_COPY.move.label), { target: { value: 'lost' } })
    const reason = screen.getByLabelText(BOARD_COPY.move.reason)
    fireEvent.change(reason, { target: { value: 'Chose another provider (fake)' } })
    // Enter in the reason moves the lead rather than saving the lead's own form.
    fireEvent.keyDown(reason, { key: 'Enter' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/pipeline/move', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: 7, to: 'lost', reason: 'Chose another provider (fake)' }),
    })
    expect(toastSuccess).toHaveBeenCalledWith(LEAD_STAGE_COPY.moved('Lost'))
  })

  it('shows and announces a refusal, and keeps the choice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'bad-move', message: MOVE_MESSAGES['bad-move'] }), {
            status: 409,
          }),
      ),
    )
    render(<LeadStagePanel leadId={7} moves={MOVES} reasonStages={['lost', 'closed']} />)
    fireEvent.change(screen.getByLabelText(BOARD_COPY.move.label), {
      target: { value: 'contacted' },
    })
    fireEvent.click(screen.getByRole('button', { name: BOARD_COPY.move.submit }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(MOVE_MESSAGES['bad-move']),
    )
    expect((screen.getByLabelText(BOARD_COPY.move.label) as HTMLSelectElement).value).toBe(
      'contacted',
    )
    expect(refresh).not.toHaveBeenCalled()
  })
})
