import { OFFICE_EMAIL, PRIVACY_NOTICE } from '@/lib/enquiryForms/strings'
import { formatIstTime } from '@/lib/time/ist'

/**
 * The words of sign-in and the account step (docs/20 §4.1), in one place for `en-IN`. Candidate
 * copy written to src/brand/VOICE.md, awaiting IIIC's approval (I-41); the lines docs/20 gives
 * are used as written there. Every message says what happened and what to do; none says whether
 * an address has an account before its code has been entered (docs/20 §4.4).
 */
export const SIGN_IN_COPY_STATUS = 'candidate' as const

export { OFFICE_EMAIL, PRIVACY_NOTICE }

/** "4:35 PM", in India. */
const at = (time: Date) => formatIstTime(time)

export const LOGIN_COPY = {
  title: 'Sign in · My IIIC',
  heading: 'Sign in to My IIIC',
  lead: 'Enter your email address and we will send you a six-digit code. There is no password.',
  emailLabel: 'Email address',
  emailHelp: 'We send your code here.',
  emailButton: 'Send me a code',
  whatsappHeading: 'Or use WhatsApp',
  mobileLabel: 'Mobile number',
  mobileHelp: 'A number in India needs no country code. We send the code on WhatsApp.',
  mobileButton: 'Send a code on WhatsApp',
  closedPreview: 'Sign-in is closed on this preview.',
  notOpen: 'Sign-in is not open yet.',
  againHeading: 'Sign in again to go on',
  again: 'For this step, IIIC asks you to have signed in within the last 10 minutes.',
  summary: 'The code was not sent',
  check: 'Check your answer',
  invalidEmail: 'Enter an email address, like name@example.com.',
  invalidMobile: 'Enter a 10-digit mobile number.',
  checkFailed: 'The spam check did not go through. Try again.',
  busy: 'Sign-in is busy just now. Try again in a few minutes.',
  tooMany: (retryAt: Date) =>
    `We've sent several codes to this address. Use the latest, or ask again after ${at(retryAt)}. For help, write to ${OFFICE_EMAIL}.`,
  whatsappClosed: 'Codes on WhatsApp cannot be sent just now. Use your email address instead.',
  failed: `That did not work on our side. Try again, or write to ${OFFICE_EMAIL}.`,
} as const

export const VERIFY_COPY = {
  title: 'Enter your code · My IIIC',
  heading: 'Enter your code',
  sent: (masked: string) =>
    `If ${masked} can receive our messages, a six-digit code is on its way. It works for 10 minutes.`,
  codeLabel: 'Six-digit code',
  trust: 'Keep me signed in on this device for 30 days',
  trustHelp:
    'Leave this unticked on a shared device. You will be signed out when the browser closes.',
  submit: 'Sign in',
  resend: 'Send a new code',
  resent: 'A new code is on its way. Only the newest code works.',
  different: 'Use a different address',
  startAgainHeading: 'Start again',
  startAgain: 'This sign-in has run out, or it began in another browser.',
  startAgainLink: 'Start again',
  summary: 'You are not signed in yet',
  malformed: 'Enter the six digits of your code.',
  wrongCode: (left: number) =>
    `That code doesn't match. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`,
  expired: 'That code has run out. Send a new code.',
  tooManyTries: 'That code had five wrong tries and no longer works. Send a new code.',
  tooEarly: (retryAt: Date) =>
    `A new code can be sent at ${at(retryAt)}. Use the latest code until then.`,
} as const

export const ACCOUNT_COPY = {
  title: 'Create your account · My IIIC',
  heading: 'Create your My IIIC account',
  lead: 'Your address is confirmed. This is the first time it has been used for My IIIC.',
  nameLabel: 'Full name',
  nameHelp: 'As you would like IIIC to address you.',
  noticeHeading: 'What you agree to',
  consent: 'I agree to the above',
  adult: 'I am 18 or older',
  create: 'Create my account',
  decline: 'No, thanks',
  summary: 'Your account was not created',
  nameMissing: 'Enter your full name.',
  consentMissing: 'Tick the box to agree, or choose No, thanks.',
  adultMissing: 'Tick the box to confirm you are 18 or older.',
  under18:
    'My IIIC accounts are for adults. A parent or guardian can book and sign in for their child.',
  noticeChanged:
    'The wording you agree to changed after this page opened. Read it again below and tick the box to create your account.',
  noticeMissing: `Accounts cannot be created just now. To reach IIIC, write to ${OFFICE_EMAIL}.`,
} as const

export const DETAIL_COPY = {
  title: 'Confirm your detail · My IIIC',
  heading: 'Enter your code',
  submit: 'Confirm',
  backToPrivacy: 'Back to your privacy settings',
  belongsToAnother: `This detail is already confirmed on another My IIIC account. To sort it out, write to ${OFFICE_EMAIL}.`,
  alreadyYours: 'This detail is already confirmed on your account.',
  added: 'Your detail is confirmed and added to your account.',
} as const

export const SIGN_OUT_COPY = {
  button: 'Sign out',
} as const
