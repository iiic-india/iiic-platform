import { CONTACT } from '@/lib/site/contact'

/**
 * The words a client reads about a proposal (en-IN), in one place: the email that carries the
 * tracked link (P5; M6 replaces it with the React Email template, docs/13) and the link's page.
 * Plain and short (src/brand/VOICE.md, "Email and WhatsApp", "Interface copy"). No amount appears
 * here, whatever the fees rule answers (D-21), and no urgency: the validity is IIIC's to state in
 * the proposal itself.
 */

export const PROPOSAL_EMAIL = {
  subject: (reference: string) => `Your proposal from IIIC, ${reference}`,
  text: ({ clientName, reference, linkUrl }: { clientName: string; reference: string; linkUrl: string }) =>
    [
      `Here is IIIC's proposal for ${clientName}, reference ${reference}.`,
      '',
      `Open it here: ${linkUrl}`,
      '',
      'The link opens the proposal as a PDF. If you have a question about it, reply to this email.',
    ].join('\n'),
} as const

/**
 * The office's words for a proposal's printed parts: `incomplete` names them, and the draft
 * preview shows an empty one as a placeholder with its name.
 */
export const PART_LABELS = {
  clientName: 'the client’s name (the lead’s organisation)',
  title: 'the title',
  subtitle: 'the subtitle',
  preparedByName: 'who prepared it',
  preparedByTitle: 'their title',
  situation: 'the situation',
  approach: 'the approach',
  phases: 'the phases, each with its name, what happens, duration and outcome',
  measures: 'how progress is measured',
  fees: 'the fees, each with an amount',
  nextStep: 'the next step',
} as const

/** A part the draft preview shows as not typed yet, in the kit's placeholder form. */
export const notTypedYet = (part: keyof typeof PART_LABELS) =>
  `[[TODO: ${PART_LABELS[part]}, not typed yet]]`

/** The lead's timeline entries the proposal actions write (the platform's, not the office's). */
export const PROPOSAL_ACTIVITY = {
  versionMade: (reference: string) => `Proposal ${reference} made.`,
  sent: (reference: string) => `Proposal ${reference} sent.`,
  accepted: (reference: string) => `Proposal ${reference}: the client accepted.`,
  declined: (reference: string) => `Proposal ${reference}: the client declined.`,
  expired: (reference: string) => `Proposal ${reference} passed its last valid day.`,
  followUpTask: 'Follow up the proposal',
} as const

export const PROPOSAL_PAGE = {
  metaTitle: 'Your proposal from IIIC',
  kicker: 'Proposal',
  preparedFor: (clientName: string) => `Prepared for ${clientName}`,
  reference: (reference: string) => `Reference ${reference}`,
  open: 'Open the proposal (PDF)',
  openHelp: 'It opens in your browser, where you can save or print it.',
  questions: 'If you have a question about it, reply to the email it came with.',
  // One page for every closed link alike: replaced, withdrawn, answered, expired or unknown.
  closedMetaTitle: 'This link no longer opens a proposal',
  closedTitle: 'This link no longer opens a proposal',
  closedLine:
    'If you were expecting a proposal from IIIC, write to us or call, and we will send you the current one.',
  email: CONTACT.email,
  phone: CONTACT.phone,
} as const
