/**
 * The newsletter's and the withdraw page's words (docs/19 §8), in one place (en-IN). Every line
 * here is a candidate written to src/brand/VOICE.md, awaiting IIIC's approval with the notices'
 * wording (I-22) and the copy approval (I-41): the pages show the candidate marker until then.
 * The notice a person agrees to is never written here: it is the consent text in force, from
 * Admin → Consent texts, shown as IIIC wrote it.
 */
export const NEWSLETTER_COPY_STATUS = 'candidate' as const

export const SIGNUP_COPY = {
  title: 'The Journal by email',
  heading: 'The Journal by email',
  lead: 'Once a month: a lead article from the Journal and up to two short pieces.',
  label: 'Email',
  help: 'We send a link to this address. You are on the list only once you open it and confirm.',
  noticeHeading: 'What you agree to when you confirm',
  button: 'Send the link',
  closed: 'Signing up is closed for now.',
  sent: 'Check your inbox. If this address can receive the Journal, a link to confirm is on its way. It works for 7 days.',
  summary: 'Check 1 answer',
  invalid: 'Enter an email address, like name@example.com.',
  busy: 'Too many tries from here. Try again in a few minutes.',
  checkFailed: 'The spam check did not go through. Send the form again.',
  failed: 'That did not go through. Try again in a few minutes.',
} as const

export const CONFIRM_COPY = {
  title: 'Confirm your subscription',
  heading: 'Confirm your subscription',
  lead: 'Press the button to start receiving the Journal by email.',
  button: 'Confirm',
  done: 'You are on the list. The next issue comes to this address.',
  already: 'This address is already on the list.',
  invalid: 'This link does not work. Sign up again to get a new one.',
  expired: 'This link has expired. Sign up again to get a new one.',
  failed: 'That did not go through. Try the link again in a few minutes.',
  signupAgain: 'Sign up again',
} as const

export const UNSUBSCRIBE_COPY = {
  title: 'Unsubscribe',
  heading: 'Stop the Journal emails',
  lead: 'Press the button and no more issues come to this address.',
  button: 'Unsubscribe',
  done: 'You are off the list. No more issues come to this address.',
  invalid: 'This link does not work. Write to us and we take you off the list by hand.',
  failed: 'That did not go through. Try the link again in a few minutes.',
} as const

export const WITHDRAW_COPY = {
  title: 'Your consents',
  heading: 'What you have agreed to',
  lead: 'Each consent below is in force. Withdraw any of them here; it takes effect at once.',
  givenOn: 'Given on',
  button: 'Withdraw',
  // The account consent ends when the account closes, in My IIIC (D-113; docs/20 §7.6).
  inMyIiic: 'Close your account in My IIIC',
  none: 'No consent of yours is in force.',
  done: 'Withdrawn. We have recorded it.',
  invalid: 'This link does not work. Open the link in a more recent email from us.',
  failed: 'That did not go through. Try again in a few minutes.',
} as const
