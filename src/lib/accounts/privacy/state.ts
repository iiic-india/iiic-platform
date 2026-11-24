import type { SignInChannel } from '@/lib/accounts/contract'

/**
 * The states of the page's two forms that keep what was typed (docs/20 §7.5): the request about
 * one's data, and adding a second contact detail with its code. Each is a React action state:
 * with JavaScript the answer comes back in place; without it the form posts to its page, which
 * is drawn with the answer. Either way a refused or invalid answer keeps the person's words, and
 * `key` changes with every answer so the error summary takes the focus again. Pure: the client
 * components and the server actions share it.
 */

export type RequestFormState = {
  status: 'idle' | 'invalid' | 'refused'
  errors: Partial<Record<'type' | 'summary', string>>
  /** The one reason the request was not taken, in words. */
  refusal: string | null
  /** Shown with the refusal: a copy or an erasure needs a recent sign-in (D-121). */
  signInAgain: boolean
  values: { type: string; summary: string }
  key: number
}

export const INITIAL_REQUEST_STATE: RequestFormState = {
  status: 'idle',
  errors: {},
  refusal: null,
  signInAgain: false,
  values: { type: '', summary: '' },
  key: 0,
}

export type DetailRequestState = {
  status: 'idle' | 'invalid' | 'refused' | 'sent'
  channel: SignInChannel
  /** What was typed, back in the field, and for "Send a new code". */
  value: string
  /** The masked address or number the code went to (docs/20 §4.4). */
  masked: string | null
  error: string | null
  key: number
}

export const initialDetailState = (channel: SignInChannel): DetailRequestState => ({
  status: 'idle',
  channel,
  value: '',
  masked: null,
  error: null,
  key: 0,
})

export type DetailConfirmState = {
  status: 'idle' | 'invalid' | 'refused'
  error: string | null
  key: number
}

export const INITIAL_CONFIRM_STATE: DetailConfirmState = { status: 'idle', error: null, key: 0 }
