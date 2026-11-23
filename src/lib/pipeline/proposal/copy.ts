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
