import type { GivablePurpose, OwnRequestType } from '@/lib/accounts/contract'
import { CONTACT } from '@/lib/site/contact'

/**
 * Every word My IIIC's privacy page shows (docs/20 §7.5), in one place for the en-IN locale,
 * written to src/brand/VOICE.md. Each line is candidate copy awaiting IIIC's approval (I-41): the
 * pages carry the candidate marker until then. The words a person agrees to are never written
 * here: they are the consent text in force (Admin → Consent texts), shown as IIIC wrote it, and
 * the account notice's own words are IIIC's to give (I-65).
 *
 * Pure, with no stylesheet behind it: the end-to-end spec reads it.
 */
export const PRIVACY_COPY_STATUS = 'candidate' as const

export const OFFICE_EMAIL = CONTACT.email

/** The account notice, until IIIC supplies it (I-65). */
export const ACCOUNT_NOTICE_TODO = 'TODO: the account notice and consent text, I-65'

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** One to nine in words, 10 and up in figures (VOICE.md, Spelling, numbers and dates). */
export function countWord(count: number): string {
  return Number.isInteger(count) && count >= 0 && count < WORDS.length
    ? (WORDS[count] as string)
    : String(count)
}

export const PAGE_COPY = {
  title: 'Privacy and settings · My IIIC',
  heading: 'Privacy and settings',
  lead: 'What you have agreed to, the messages you get from IIIC, your requests about your data, and how you sign in.',
  done: 'Done',
  problem: 'There is a problem',
} as const

export const AGREED_COPY = {
  heading: 'What you have agreed to',
  lead: 'Every consent on record for you, and when it last changed. A withdrawal takes effect at once.',
  purpose: 'Consent',
  state: 'Now',
  since: 'Since',
  action: 'Change',
  granted: 'Given',
  withdrawn: 'Withdrawn',
  withdraw: 'Withdraw',
  close: 'Close your account',
  closeHelp: 'Closing your account ends this one.',
  none: 'No consent of yours is on record.',
} as const

export const MESSAGES_COPY = {
  heading: 'Messages from IIIC',
  offers: {
    marketingEmail: {
      title: 'The Journal by email',
      lead: 'Once a month: a lead article from the Journal and up to two short pieces.',
      button: 'Send me the Journal',
      given: 'Recorded. The Journal comes to your email address from its next issue.',
      held: 'You get the Journal by email. To stop it, withdraw it above.',
    },
    marketingWhatsapp: {
      // What the updates hold is the consent text's to say (I-22), so no line of its own here.
      title: 'Updates on WhatsApp',
      lead: null,
      button: 'Send me updates on WhatsApp',
      given: 'Recorded. IIIC’s updates come to your mobile number on WhatsApp.',
      held: 'You get IIIC’s updates on WhatsApp. To stop them, withdraw it above.',
    },
  } satisfies Record<
    GivablePurpose,
    { title: string; lead: string | null; button: string; given: string; held: string }
  >,
  agree: 'What you agree to',
  needsEmail: 'To get the Journal by email, add an email address under Your contact details.',
  nothing: 'Nothing more to choose here.',
} as const

export const REQUEST_TYPE_LABELS: Record<OwnRequestType | 'withdrawal', string> = {
  access: 'A copy of your data',
  correction: 'A correction to your data',
  erasure: 'Erasure of your data',
  nomination: 'A nominee to act for you',
  privacyGrievance: 'A privacy grievance',
  consumerComplaint: 'A consumer complaint',
  withdrawal: 'Withdrawal of a consent',
}

/** A request's state as the person reads it; the office's own steps stay the office's. */
export const REQUEST_STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  acknowledged: 'Acknowledged',
  verified: 'Being prepared',
  preparing: 'Being prepared',
  awaitingOwner: 'Being prepared',
  closed: 'Closed',
}

export const REQUEST_COPY = {
  heading: 'Ask about your data',
  lead: 'Ask for a copy of your data, a correction or its erasure, name a nominee, or raise a privacy grievance or a complaint. IIIC’s office acknowledges every request within 48 hours.',
  type: 'What you are asking for',
  choose: 'Choose one',
  summary: 'Tell us more',
  summaryHelp: 'What you would like done. The office reads it and replies to you. Up to 2,000 characters.',
  button: 'Send the request',
  recent:
    'A copy or an erasure of your data needs a sign-in within the last 10 minutes. Sign in again first, then send the request.',
  signInAgain: 'Sign in again',
  sent: 'Sent. IIIC’s office acknowledges it within 48 hours; the list below shows when it is due.',
  listHeading: 'Your requests',
  request: 'Request',
  received: 'Received',
  status: 'Status',
  due: 'Due by',
  none: 'You have made no requests about your data.',
  checkOne: 'Check 1 answer',
  checkMany: (count: number) => `Check ${countWord(count)} answers`,
  notSent: 'The request was not sent',
  errors: {
    type: 'Choose what you are asking for.',
    summary: 'Tell us what you are asking for.',
    summaryLong: 'Shorten this to 2,000 characters or fewer.',
  },
  refusals: {
    'open-request-exists': `You already have an open request of this kind. The office replies to it; to add something, write to ${OFFICE_EMAIL}.`,
    'sign-in-again':
      'A copy or an erasure of your data needs a sign-in within the last 10 minutes. Sign in again, then send the request.',
    'closed-here': `This cannot be sent from here just now. Write to ${OFFICE_EMAIL} instead.`,
    failed: `The request was not sent because of a fault on IIIC’s side. Send it again, or write to ${OFFICE_EMAIL}.`,
  },
} as const

export const CONTACT_COPY = {
  heading: 'Your contact details',
  lead: 'You sign in to My IIIC with these.',
  email: 'Email address',
  mobile: 'Mobile number',
  none: 'None yet',
  addEmail: 'Add an email address',
  addMobile: 'Add a mobile number',
  added: 'Added. You can sign in with it from now on.',
} as const

export const DETAIL_COPY = {
  email: {
    title: 'Add an email address · My IIIC',
    heading: 'Add an email address',
    label: 'Email address',
    help: 'We send a six-digit code to this address.',
    invalid: 'Enter an email address, like name@example.com.',
  },
  whatsapp: {
    title: 'Add a mobile number · My IIIC',
    heading: 'Add a mobile number',
    label: 'Mobile number',
    help: 'We send a six-digit code to this number on WhatsApp.',
    invalid: 'Enter a 10-digit mobile number.',
  },
  send: 'Send me a code',
  codeHeading: 'Enter your code',
  sentTo: (masked: string) =>
    `If ${masked} can receive our messages, a six-digit code is on its way. It works for 10 minutes.`,
  code: 'Six-digit code',
  confirm: 'Add it to my account',
  resend: 'Send a new code',
  different: 'Use a different one',
  back: 'Back to privacy and settings',
  checkOne: 'Check 1 answer',
  notDone: 'That did not go through',
  codeInvalid: 'Enter the six digits of the code.',
  wrongCode: (left: number) =>
    left === 1
      ? 'That code doesn’t match. You have one try left.'
      : `That code doesn’t match. You have ${countWord(left)} tries left.`,
  refusals: {
    'closed-here': `This cannot be done from here just now. Write to ${OFFICE_EMAIL} instead.`,
    'whatsapp-closed': 'Codes on WhatsApp are not available just now. Add an email address instead.',
    'check-failed': 'The spam check did not go through. Send the form again.',
    'too-many': (at: string) =>
      `We’ve sent several codes to this address. Use the latest, or ask again after ${at}.`,
    busy: 'Many codes were asked for in the last few minutes. Try again shortly.',
    'already-yours': 'This is already on your account.',
    expired: 'That code has run out. Send a new code.',
    'too-many-tries': 'That code had five wrong tries and no longer works. Send a new code.',
    'no-request': 'Start again: ask for a new code.',
    'belongs-to-another-account': `This is on another My IIIC account. Write to ${OFFICE_EMAIL} and the office will sort it out.`,
    failed: 'That did not go through. Try again in a few minutes.',
  },
} as const

export const DEVICES_COPY = {
  heading: 'Devices',
  lead: 'Where you are signed in to My IIIC.',
  device: 'Device',
  signedIn: 'Signed in',
  ends: 'Signed out by',
  thisDevice: 'This device',
  aBrowser: 'A browser',
  browserCloses: 'When the browser closes',
  button: 'Sign out everywhere',
  help: 'Signs out every device but this one.',
  done: (count: number) =>
    count === 0
      ? 'No other device was signed in.'
      : count === 1
        ? 'Signed out of one other device.'
        : `Signed out of ${countWord(count)} other devices.`,
} as const

export const CLOSE_COPY = {
  title: 'Close your account · My IIIC',
  heading: 'Close your account',
  lead: 'Closing your account ends your sign-ins to My IIIC. Your bookings and invoices stay with IIIC’s office.',
  link: 'Close your account',
  does: 'What closing does',
  doesList: [
    'You can no longer sign in to My IIIC, on any device.',
    'Your sign-in details and every session are deleted.',
    'My IIIC no longer shows your bookings, documents or invoices.',
    'Your consent to keeping the account is withdrawn.',
    'If the account has an email address, a confirmation goes there.',
  ],
  keeps: 'What IIIC keeps',
  keepsText:
    'Your bookings, payments, invoices and certificates, and the consents you gave for anything else, stay with IIIC’s office, each for as long as its own rule says.',
  privacyNotice: 'Read the privacy notice',
  erasure: `To have the rest of your data removed too, ask for its erasure under Ask about your data before you close the account, or write to ${OFFICE_EMAIL} afterwards.`,
  notice: 'What you agreed to when you made the account',
  recent:
    'Closing your account needs a sign-in within the last 10 minutes. Sign in again first, then close it.',
  button: 'Close my account',
  decline: 'No, thanks',
  failed: 'That did not go through. Try again in a few minutes.',
  closedHere: `This cannot be done from here just now. Write to ${OFFICE_EMAIL} instead.`,
} as const

export const CLOSED_COPY = {
  title: 'Account closed · My IIIC',
  heading: 'Your My IIIC account is closed',
  lead: 'You are signed out on every device. If the account had an email address, a confirmation is on its way there.',
  keeps: `IIIC’s office keeps your bookings, invoices and certificates under their own rules. To have your data erased, write to ${OFFICE_EMAIL}.`,
  home: 'Go to the home page',
} as const

/** What a finished action says at the top of the page (`?done=`). */
export const DONE_COPY = {
  withdrawn: (label: string) => `Withdrawn: ${label}. It takes effect at once.`,
  'already-given': 'That is already on record for you.',
  'request-sent': REQUEST_COPY.sent,
  'detail-added': CONTACT_COPY.added,
} as const

/** What a refused action says at the top of the page (`?error=`). */
export const ERROR_COPY = {
  'none-in-force': 'That consent is not in force, so there is nothing to withdraw.',
  'notice-changed':
    'The words for this consent changed while the page was open. Read them again below, then tick the box.',
  unticked: 'Tick the box to agree, then send it.',
  'closed-here': `That cannot be done from here just now. Write to ${OFFICE_EMAIL} instead.`,
  failed: 'That did not go through. Try again in a few minutes.',
} as const
