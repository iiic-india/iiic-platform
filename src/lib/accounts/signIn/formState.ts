/**
 * What a sign-in form shows after an answer (docs/20 §4.1): the messages by field, a reason not
 * tied to a field, a status line, what was typed (never the code), and for the account step the
 * notice now in force when it changed under the person. The same state comes back with and
 * without JavaScript: without it, the page is drawn again with it (useActionState's permalink).
 */
export type SignInFormState = {
  /** Counts the answers: the form is drawn again, and the summary takes focus, after each. */
  attempt: number
  /** Messages by the id of the field they are about. */
  errors: Record<string, string>
  /** Why the form was not taken, when no field is at fault. */
  refusal?: string
  /** A status that is not a fault ("A new code is on its way"). */
  info?: string
  values: Record<string, string>
  notice?: { id: number; text: string }
}

export const INITIAL_SIGN_IN_STATE: SignInFormState = { attempt: 0, errors: {}, values: {} }

/** The ids of the fields, so a summary's link and a field's message point at the same one. */
export const FIELD_IDS = {
  email: 'login-email',
  mobile: 'login-mobile',
  code: 'verify-code',
  fullName: 'account-name',
  consent: 'account-consent',
  adult: 'account-adult',
  detailCode: 'detail-code',
  detailIdentifier: 'detail-identifier',
} as const
