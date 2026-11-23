/**
 * The Privacy view's and the request actions' words (en-IN), in one place (src/brand/VOICE.md).
 * Clocks are always said in words, never by colour alone (docs/18 §5).
 */
export const PRIVACY_COPY = {
  title: 'Privacy',
  intro:
    'Open privacy requests by their deadline, the consent log, and open incidents with both clocks.',
  navLabel: 'Privacy',
  notAllowed: 'Only owners and the operator can open Privacy.',

  requests: 'Open requests',
  requestsNone: 'No open privacy requests.',
  kind: 'Kind',
  status: 'Status',
  received: 'Received',
  acknowledge: 'Acknowledgement',
  resolve: 'Resolution',
  open: 'Open',

  consentLog: 'Consent log',
  consentIntro:
    'Every entry as it was recorded: no entry is changed or deleted. Filter by person, purpose, kind and period.',
  person: 'Person (record number)',
  purpose: 'Purpose',
  anyPurpose: 'Any purpose',
  entryKind: 'Entry',
  anyEntry: 'Given or withdrawn',
  given: 'Given',
  withdrawn: 'Withdrawn',
  from: 'From (IST day)',
  to: 'To (IST day)',
  filter: 'Show entries',
  consentNone: 'No entries match.',
  at: 'When',
  channel: 'How',
  notice: 'Notice',
  evidence: 'Evidence',
  noEvidence: 'None recorded',
  deviceRecorded: 'IP address and browser recorded',
  shownOf: (shown: number, total: number) =>
    shown === total ? `${total} entries` : `The latest ${shown} of ${total} entries`,

  incidents: 'Open incidents',
  incidentsNone: 'No open incidents.',
  detected: 'Detected',
  certIn: 'CERT-In (6 hours)',
  board: 'Data Protection Board (72 hours)',

  clock: {
    done: (at: string) => `Done ${at}`,
    running: (hours: number, due: string) =>
      hours === 0
        ? `Under an hour left (by ${due})`
        : `${hours} ${hours === 1 ? 'hour' : 'hours'} left (by ${due})`,
    overdue: (hours: number, due: string) =>
      `Overdue by ${hours} ${hours === 1 ? 'hour' : 'hours'} (was due ${due})`,
    notApplicable: 'Not applicable',
    certInUnassessed: 'Not marked a listed incident. Assess it within the first hour.',
    boardUnassessed: 'Not marked as affecting personal data. Assess it within the first hour.',
  },

  actions: {
    title: 'What this request needs',
    saveFirst: 'Save the request first.',
    verifyFirst: 'Record the identity check and save, then come back here.',
    plan: 'Show what the erasure deletes and keeps',
    planning: 'Working out the plan…',
    deletes: 'Deleted',
    keeps: 'Kept, and why',
    what: 'What',
    count: 'How many',
    why: 'Why',
    ownerConfirms:
      'An owner reads this plan and confirms. Set the status to “Waiting for an owner” when it is ready.',
    confirmTitle: 'Confirm erasure',
    readPlanFirst: 'Read the plan above before you confirm.',
    confirmWarning:
      'This deletes what the plan lists and cannot be undone. Enter the code from your authenticator app to confirm.',
    code: 'Two-factor code',
    confirm: 'Confirm erasure',
    confirmed: 'The erasure is done and the request is closed.',
    exportTitle: 'The access export',
    exportIntro:
      'Makes the person’s records into a JSON file and a readable page, kept in the private store for you to send. Session notes are not included. Enter the code from your authenticator app to make it.',
    exportMake: 'Make the export',
    exportMade: 'The export is ready.',
    exportReady: 'An export is ready to send:',
    downloadJson: 'Download the JSON file',
    downloadPage: 'Download the readable page',
    exportOwnerOnly: 'An owner makes the export.',
    working: 'Working…',
  },

  errors: {
    refused: 'Sign in with your two-factor code, as an owner or the operator, to do this.',
    'enter-code': 'Enter the code from your authenticator app to confirm.',
    'not-allowed': 'Only an owner can do this.',
    invalid: 'That request was not understood. Reload the page and try again.',
    'not-found': 'That request is not there, or has no export yet.',
    'not-now': 'The request is not at the step this needs. Check its status.',
    'not-verified': 'Record the identity check first.',
    'storage-missing':
      'This deployment has no private bucket for exports (R2_BUCKET_PRIVATE), so nothing was kept.',
    'wrong-code': 'That code did not match. Check your authenticator app and try again.',
    locked: 'This account is locked after too many wrong codes. Try again later, or ask an owner.',
    failed: 'That did not work. Try again in a moment.',
  },
} as const

export type PrivacyErrorCode = keyof typeof PRIVACY_COPY.errors
