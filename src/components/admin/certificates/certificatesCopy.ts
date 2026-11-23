/**
 * The words of the certificates screens in the admin and the answers of their routes (docs/18 §4;
 * src/brand/VOICE.md). Certificate, programme, completion: never degree, diploma, university or
 * any word that implies recognition (CLAUDE.md #9). In one place for en-IN.
 */
export const CERTIFICATES_COPY = {
  navLink: 'Certificates',
  title: 'Issue certificates',
  intro:
    'Each person gets a certificate of completion with its own ID and QR code. Preview the pages first: nothing is stored until you issue.',
  notAllowed: 'Your role cannot issue certificates. An owner or the operator can.',

  waitsTitle: 'Before the first issue',
  waitsSignatory:
    'The signatory’s name and title are not in Settings → Certificates yet (I-51). The preview shows a placeholder, and issuing waits until both are there.',
  waitsStatement:
    'The certificate’s fixed statement is a draft until the lawyer’s review (I-22).',
  waitsStorage:
    'This deployment has no private bucket for the PDFs (R2_BUCKET_PRIVATE), so issuing is switched off here.',
  waitsRenderer:
    'PDFs cannot be made here yet: the PDF renderer arrives with M3’s documents. The preview works.',

  programmeLegend: 'The programme',
  programmeName: 'Programme',
  programmeNameHint: 'As it should print, such as the course’s full name.',
  programmeDetails: 'Details (optional)',
  programmeDetailsHint: 'A second line: the batch, the dates or the hours.',
  completedOn: 'Completed on',

  recipientsLegend: 'Recipients',
  recipientsHint:
    'Find each person on record, then check the name as it should print. Up to 200 at once.',
  findPerson: 'Find a person',
  findPersonHint: 'Two letters or more of their name.',
  search: 'Search',
  searching: 'Searching…',
  noMatches: 'No one on record matches that name.',
  addPerson: (name: string) => `Add ${name}`,
  fromEvent: 'Or add everyone booked on an event',
  noEvent: 'Choose an event',
  addEvent: 'Add everyone booked',
  eventEmpty: 'No one is booked on that event.',
  nameAsPrinted: 'Name as printed',
  personOnRecord: 'On record as',
  remove: (name: string) => `Remove ${name}`,
  noRecipients: 'No recipients yet. Find a person above to add them.',
  recipientCount: (count: number) => (count === 1 ? '1 recipient' : `${count} recipients`),
  tooMany: 'An issue takes up to 200 people. Issue the rest in a second batch.',
  alreadyAdded: (name: string) => `${name} is already on the list.`,

  preview: 'Preview certificates',
  previewing: 'Making the preview…',
  previewTitle: 'Preview',
  previewNote: (shown: number, total: number) =>
    shown < total
      ? `The first ${shown} of ${total} pages. Every page prints the same way with its own name.`
      : 'Every page as it will print. The ID and the QR code are given on issue.',
  previewFrame: (name: string) => `Certificate preview for ${name}`,
  previewWaiting: (inputs: string[]) => `Still waiting for ${inputs.join(', ')}.`,
  issue: (count: number) =>
    count === 1 ? 'Issue 1 certificate' : `Issue ${count} certificates`,
  issueConfirmTitle: 'Issue these certificates?',
  issueConfirm: (count: number) =>
    `This issues ${count === 1 ? '1 certificate' : `${count} certificates`} with their own IDs. Each can be revoked later by an owner, but an ID is never given again.`,
  issuing: 'Issuing…',
  issued: (ids: string[]) =>
    ids.length === 1 ? `Issued ${ids[0]}.` : `Issued ${ids.length} certificates: ${ids.join(', ')}.`,
  cancel: 'Cancel',

  errorTitle: 'Nothing was issued',
  failed: 'That did not work. Try again in a moment.',
  offline: 'The admin could not reach the server. Check the connection and try again.',

  recentTitle: 'Latest certificates',
  recentNone: 'No certificates yet. Each one you issue appears here.',
  certificateId: 'Certificate ID',
  status: 'Status',
  valid: 'Valid',
  revokedStatus: 'Revoked',
  details: 'Details',
  issuedOn: 'Issued on',
  revokedOn: 'Revoked on',
  openRecord: 'Open the record',

  // The record's own panel: download, revoke, reissue.
  recordTitle: 'Certificate',
  download: 'Download the PDF',
  revokeTitle: 'Revoke',
  revokeHint:
    'The verify page shows Revoked at once. The reason stays in the admin and never appears on the page.',
  reason: 'Reason',
  revoke: 'Revoke certificate',
  revokeConfirmTitle: 'Revoke this certificate?',
  revokeConfirm: (id: string) => `${id} will show as Revoked to anyone who checks it.`,
  revoked: (id: string) => `Revoked ${id}.`,
  reissueTitle: 'Reissue with a correction',
  reissueHint:
    'Revokes this one with the reason and issues a corrected certificate under a new ID. The old page names the new ID. Leave a field empty to keep it as printed.',
  reissue: 'Reissue certificate',
  reissueConfirmTitle: 'Reissue this certificate?',
  reissueConfirm: (id: string) => `${id} will be revoked and a corrected certificate issued.`,
  reissued: (id: string) => `Issued ${id} in its place.`,
  revokeOwnersOnly: 'Only an owner can revoke or reissue a certificate.',
  alreadyRevokedNote: 'This certificate is revoked.',
  working: 'Working…',
} as const

/** What a route answers for each refusal, in the admin's words (docs/18 §4). */
export const CERTIFICATE_ANSWERS = {
  'sign-in': 'Sign in again to continue.',
  'enter-code': 'Enter your two-factor code first.',
  'not-allowed': 'Your role cannot do this.',
  invalid: 'Check the form:',
  'signatory-missing':
    'Add the signatory’s name and title in Settings → Certificates first (I-51). Nothing was issued.',
  'storage-missing':
    'This deployment has no private bucket for certificates (R2_BUCKET_PRIVATE). Nothing was issued.',
  'person-not-found': (ids: number[]) =>
    `${ids.length === 1 ? 'One person is' : `${ids.length} people are`} no longer on record (ID ${ids.join(', ')}). Remove them and try again.`,
  'not-found': 'No certificate matches.',
  'already-revoked': 'This certificate is already revoked.',
  'render-failed':
    'The PDF could not be made, so nothing was issued. Try again; if it keeps failing, PDFs may not be set up on this deployment yet.',
  tooLarge: 'That request is too large. Issue fewer people at once.',
  notJson: 'The form could not be read. Reload the page and try again.',
} as const
