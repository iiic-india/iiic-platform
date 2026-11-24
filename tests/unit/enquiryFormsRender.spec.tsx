import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import type { PageContent } from '@/lib/content/types'
import {
  type EnquiryFormAction,
  type EnquiryFormState,
  type FormSetup,
  INITIAL_FORM_STATE,
  type PageForms,
} from '@/lib/enquiryForms/state'
import {
  checkAnswers,
  FORM_COPY,
  NOT_SENT,
  PROPOSAL_CALL,
  REFUSALS,
  TRAP_LABEL,
} from '@/lib/enquiryForms/strings'
import { TURNSTILE_SCRIPT_URL } from '@/lib/enquiryForms/turnstileOrigin'
import { FORM_MESSAGES } from '@/lib/pipeline/forms'

// The two public forms as their pages draw them (docs/17 §6): hidden until a consent text is
// in force, then the kit's form, its error summary and its acknowledgement, each taking focus.
// The server action is a fake here (tests/unit/enquiryFormsSubmit.spec.ts tests the real core).
afterEach(() => {
  cleanup()
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((script) => script.remove())
})

const NOTICE = { version: 4, text: 'Fake consent text for replies to an enquiry.' }

const layoutOf = (...types: ('teamMapRequest' | 'partnershipEnquiry')[]): PageContent['layout'] =>
  types.map((blockType) => ({ blockType }))

function setupWith(action: EnquiryFormAction, overrides: Partial<FormSetup> = {}): FormSetup {
  return {
    notice: NOTICE,
    drawn: '1795415400000.fake-signature',
    turnstileSiteKey: null,
    page: '/organisations/team-map',
    action,
    ...overrides,
  }
}

/** A fake action that answers with each state given, in turn. */
function answering(...answers: Partial<EnquiryFormState>[]) {
  let attempt = 0
  return vi.fn(async (_previous: EnquiryFormState, _form: FormData) => {
    const answer = answers[Math.min(attempt, answers.length - 1)]
    attempt += 1
    return { ...INITIAL_FORM_STATE, ...answer, attempt }
  })
}

const draw = (layout: PageContent['layout'], forms?: PageForms) =>
  render(<RenderBlocks layout={layout} forms={forms} />)

async function sendForm(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('a form’s section', () => {
  it('shows its placeholder, and no form, while no consent text is in force', () => {
    const { container } = draw(layoutOf('teamMapRequest', 'partnershipEnquiry'), {
      teamMap: setupWith(answering({}), { notice: null }),
    })
    for (const anchor of ['team-map-request', 'partnership-enquiry']) {
      const section = container.querySelector(`section#${anchor}`) as HTMLElement
      expect(section.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-22')
      expect(section.querySelector('form')).toBeNull()
      // The forms' words await IIIC's approval (I-41).
      expect(section.querySelector('[data-candidate="I-41"]')).not.toBeNull()
    }
    expect(screen.getByRole('heading', { level: 2, name: 'Request a Team Map' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Partner with IIIC' })).toBeTruthy()
  })

  it('draws every question with its label, and the consent box unticked beside the notice', () => {
    const { container } = draw(layoutOf('teamMapRequest'), { teamMap: setupWith(answering({})) })
    const form = screen.getByRole('form', { name: FORM_COPY.teamMap.heading })
    for (const field of FORM_COPY.teamMap.fields) {
      const input = within(form).getByLabelText(field.label) as HTMLInputElement
      expect(input.name).toBe(field.name)
      expect(input.required).toBe(field.required)
    }
    const consent = within(form).getByRole('checkbox', { name: NOTICE.text }) as HTMLInputElement
    expect(consent.checked).toBe(false)
    expect(consent.value).toBe('yes')
    expect(
      within(form).getByRole('link', { name: 'Read the privacy notice' }).getAttribute('href'),
    ).toBe('/privacy')
    const hidden = (name: string) =>
      (form.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement | null)?.value
    expect(hidden('drawn')).toBe('1795415400000.fake-signature')
    expect(hidden('page')).toBe('/organisations/team-map')
    expect(hidden('noticeVersion')).toBe('4')
    // The trap is hidden from screen readers and out of the tab order.
    const trap = form.querySelector('input[name="homepage"]') as HTMLInputElement
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(trap.tabIndex).toBe(-1)
    expect(screen.queryByRole('textbox', { name: TRAP_LABEL })).toBeNull()
    // The browser checks nothing: the server's answers are the same with or without a script.
    expect((form as HTMLFormElement).noValidate).toBe(true)
    expect(container.querySelector('script')).toBeNull()
  })

  it('gives two forms on one page their own ids', () => {
    const { container } = draw(layoutOf('teamMapRequest', 'partnershipEnquiry'), {
      teamMap: setupWith(answering({})),
      partnership: setupWith(answering({}), { page: '/institute' }),
    })
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(container.querySelectorAll('form')).toHaveLength(2)
  })
})

describe('an answer to check', () => {
  it('brings the error summary, which takes focus and links to each field', async () => {
    const action = answering({
      status: 'invalid',
      errors: { email: FORM_MESSAGES.email, consent: FORM_MESSAGES.consent },
      values: { company: 'Fake Company', email: 'fake@' },
    })
    draw(layoutOf('teamMapRequest'), { teamMap: setupWith(action) })
    await sendForm(FORM_COPY.teamMap.submit)
    const summary = await screen.findByRole('alert')
    expect(within(summary).getByRole('heading').textContent).toBe(checkAnswers(2))
    await waitFor(() => expect(document.activeElement).toBe(summary))
    const links = within(summary).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [FORM_MESSAGES.email, '#tm-email'],
      [FORM_MESSAGES.consent, '#tm-consent'],
    ])
    // Each message beside its field, and what was typed kept.
    const email = screen.getByLabelText('Work email') as HTMLInputElement
    expect(email.value).toBe('fake@')
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(email.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      FORM_MESSAGES.email,
    )
    expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('Fake Company')
    expect(action).toHaveBeenCalledTimes(1)
    const sent = action.mock.calls[0]?.[1] as FormData
    expect(sent.get('noticeVersion')).toBe('4')
  })

  it('shows a refusal with what to do instead', async () => {
    draw(layoutOf('teamMapRequest'), {
      teamMap: setupWith(answering({ status: 'refused', refusal: 'limit' })),
    })
    await sendForm(FORM_COPY.teamMap.submit)
    const summary = await screen.findByRole('alert')
    expect(within(summary).getByRole('heading').textContent).toBe(NOT_SENT)
    expect(summary.textContent).toContain(REFUSALS.limit)
  })

  it('shows the new consent text, unticked, when it changed after the page opened', async () => {
    const newer = { version: 5, text: 'Fake consent text, version 5.' }
    draw(layoutOf('teamMapRequest'), {
      teamMap: setupWith(
        answering({ status: 'refused', refusal: 'notice-changed', notice: newer, values: {} }),
      ),
    })
    await sendForm(FORM_COPY.teamMap.submit)
    const consent = (await screen.findByRole('checkbox', { name: newer.text })) as HTMLInputElement
    expect(consent.checked).toBe(false)
    const version = document.querySelector('input[name="noticeVersion"]') as HTMLInputElement
    expect(version.value).toBe('5')
  })
})

describe('a sent form', () => {
  it('is replaced by the acknowledgement, which takes focus and offers the proposal call', async () => {
    const { container } = draw(layoutOf('teamMapRequest'), {
      teamMap: setupWith(answering({ status: 'received' })),
    })
    await sendForm(FORM_COPY.teamMap.submit)
    const acknowledgement = await screen.findByRole('status')
    await waitFor(() => expect(document.activeElement).toBe(acknowledgement))
    expect(container.querySelector('form')).toBeNull()
    expect(acknowledgement.textContent).toContain(FORM_COPY.teamMap.acknowledgement.heading)
    for (const line of FORM_COPY.teamMap.acknowledgement.lines) {
      expect(acknowledgement.textContent).toContain(line)
    }
    expect(
      within(acknowledgement).getByRole('link', { name: PROPOSAL_CALL.label }).getAttribute('href'),
    ).toBe('/book/call')
  })

  it('after a partnership enquiry, offers no call', async () => {
    draw(layoutOf('partnershipEnquiry'), {
      partnership: setupWith(answering({ status: 'received' }), { page: '/institute' }),
    })
    await sendForm(FORM_COPY.partnership.submit)
    const acknowledgement = await screen.findByRole('status')
    expect(within(acknowledgement).queryByRole('link')).toBeNull()
    expect(acknowledgement.textContent).toContain(FORM_COPY.partnership.acknowledgement.heading)
  })
})

describe('Turnstile', () => {
  it('loads its script only where its site key is given', () => {
    draw(layoutOf('teamMapRequest'), {
      teamMap: setupWith(answering({}), { turnstileSiteKey: 'fake-site-key' }),
    })
    const scripts = [...document.head.querySelectorAll('script')].map((script) => script.src)
    expect(scripts).toContain(TURNSTILE_SCRIPT_URL)
  })
})
