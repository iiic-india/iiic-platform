/**
 * The words of the public verify pages, /institute/verify and /institute/verify/<token>
 * (docs/18 §4; src/brand/VOICE.md). The reader holds a certificate, or a copy of one, and wants to
 * know it is real. The pages say what IIIC's record shows and nothing more: certificate of
 * completion, never a word that implies a degree, a diploma or recognition (CLAUDE.md #9).
 */
export const VERIFY_COPY = {
  title: 'Check a certificate',
  description:
    'Check a certificate of completion from Indian Institute of Image Catalysts by its ID or QR code.',
  heading: 'Check a certificate',
  intro:
    'Every certificate of completion from Indian Institute of Image Catalysts carries an ID and a QR code, printed at its foot. Type the ID here, or scan the code with a phone camera.',
  label: 'Certificate ID',
  help: 'As printed, such as IIIC-C-2027-0001-9. Small letters and spaces are fine.',
  button: 'Check',
  errorTitle: 'Check 1 answer',
  idInvalid: 'Enter the certificate ID as printed, such as IIIC-C-2027-0001-9.',

  resultHeading: (id: string) => `Certificate ${id}`,
  notFoundHeading: 'No certificate matches',
  notFoundById:
    'No certificate in IIIC’s record has that ID. Check each character against the certificate, then try again.',
  notFoundByToken:
    'No certificate in IIIC’s record matches this link. Check that the whole address was opened, or type the ID printed on the certificate.',
  typeTheId: 'Type a certificate ID',

  fields: {
    id: 'Certificate ID',
    status: 'Status',
    name: 'Name',
    programme: 'Programme',
    details: 'Details',
    completedOn: 'Completed on',
    issuedOn: 'Issued on',
  },
  valid: 'Valid',
  revoked: 'Revoked',
  validNote:
    'This certificate was issued by Indian Institute of Image Catalysts and has not been revoked.',
  revokedNote: (day: string | null) =>
    day
      ? `Indian Institute of Image Catalysts revoked this certificate on ${day}.`
      : 'Indian Institute of Image Catalysts has revoked this certificate.',
  replacedBy: 'It was replaced by certificate',
  checkReplacement: (id: string) => `Check certificate ${id}`,
  initialsNote:
    'Checked by ID, the name shows as initials. The QR code on the certificate shows it in full.',

  statementHeading: 'What this certificate is',
  draftMark: 'Draft wording, awaiting legal review',
} as const
