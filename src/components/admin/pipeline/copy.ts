/**
 * The office's words for the Pipeline board and the proposal panels (en-IN), in one place
 * (src/brand/VOICE.md, "Interface copy"). No amount appears here: the fees are shown only in
 * their own fields, to the roles that may read them.
 */

export const BOARD_COPY = {
  title: 'Pipeline',
  navLabel: 'Pipeline',
  intro:
    'Each column is a stage. Move a lead with "Move to stage" on its card; open it to see its timeline and tasks.',
  notAllowed: 'Only an owner or an operator can open the pipeline.',
  boards: 'Boards',
  board: { consultancy: 'Consultancy', partnership: 'Partnerships' },
  needsAttention: 'Needs attention',
  needsAttentionNone: 'Nothing needs attention: every new lead has been answered and none has gone quiet.',
  emptyColumn: 'No leads at this stage.',
  count: (n: number) => (n === 1 ? '1 lead' : `${n} leads`),
  finalNote: (n: number) => `The ${n} most recent are shown.`,
  truncated: (n: number) => `Showing the first ${n}. Use the leads list to see the rest.`,
  organisation: 'Organisation',
  owner: 'Looked after by',
  nobody: 'No one yet',
  nextAction: 'Next',
  due: 'due',
  untitled: 'Lead without a title',
  stage: 'Stage',
  heat: {
    amber: 'No reply yet, over 24 hours',
    red: 'No reply yet, over 48 hours',
    stale: (since: string) => `Quiet since ${since}`,
  },
  move: {
    label: 'Move to stage',
    choose: 'Choose a stage',
    reason: 'Why it ended',
    reasonHelp: 'Needed for Lost or Closed. Kept for the won-and-lost report.',
    submit: 'Move',
    moving: 'Moving…',
    final: 'This lead has ended. A new request opens a new lead.',
    moved: (title: string, stage: string) => `${title} moved to ${stage}.`,
    failed: 'The lead was not moved. Reload the page and try again.',
    offline: 'The lead was not moved: the connection dropped. Try again.',
  },
} as const

export const MOVE_MESSAGES = {
  signIn: 'Sign in with your code to do this.',
  role: 'Only an owner or an operator can move a lead.',
  invalid: 'Choose a stage, then press Move.',
  'not-found': 'That lead is no longer here. Reload the page.',
  'not-allowed': 'Only an owner or an operator can move a lead.',
  'bad-move': 'A lead cannot move there from its stage. Reload the page to see where it stands.',
  'reason-required': 'Say why it ended, then press Move.',
} as const

export const PROPOSAL_PANEL_COPY = {
  heading: 'Proposal actions',
  unsaved: 'Save the proposal first. Its actions appear here once it is saved.',
  status: 'Status',
  statuses: {
    draft: 'Draft',
    sent: 'Sent',
    viewed: 'Opened by the client',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
  },
  previewDraft: 'Preview the working copy',
  previewHelp:
    'Opens in a new tab. Parts not typed yet show as placeholders. Save first to see your latest changes.',
  createVersion: 'Create version',
  creating: 'Creating…',
  createHelp:
    'Freezes the working copy as the next version. Only a version can be printed and sent.',
  created: (number: number) => `Version ${number} created.`,
  currentVersion: (number: number) => `Open version ${number}`,
  sentVersion: (number: number) => `Version ${number} is the one the client has.`,
  noVersion: 'No version yet.',
  feesHidden:
    'Proposals are not previewed or printed while prices are hidden (the prices setting), so none can be sent yet.',
  answer: {
    heading: 'What the client answered',
    help: 'Record it when the client accepts or declines. The signed acceptance stays outside the platform.',
    accepted: 'Accepted',
    declined: 'Declined',
    choose: 'Their answer',
    note: 'What they said',
    noteHelp: 'In the office’s words. Optional.',
    submit: 'Record the answer',
    recording: 'Recording…',
    recorded: 'Answer recorded.',
  },
  failed: 'That did not work. Reload the page and try again.',
  offline: 'The connection dropped. Try again.',
} as const

export const VERSION_PANEL_COPY = {
  heading: 'This version',
  preview: 'Preview',
  pdf: 'Open the PDF',
  openHelp: 'Opens in a new tab.',
  send: 'Send to the client',
  sending: 'Sending…',
  sendHelp:
    'Emails the lead’s contact a link to this version. Any link sent before closes. The email carries no amount.',
  sent: 'Sent.',
  mailed: 'The email has gone to the lead’s contact.',
  notMailed:
    'The email did not go. Copy the link below into your own message, or send again, which makes a new link.',
  link: 'The link, shown once',
  linkHelp: 'It is not stored, so copy it now if you need it.',
  copy: 'Copy the link',
  copied: 'Link copied.',
  withdraw: 'Withdraw the link',
  withdrawing: 'Withdrawing…',
  withdrawHelp: 'The link stops opening the proposal. The client sees a page that says so.',
  withdrawn: 'Link withdrawn.',
  replaced: 'A later version was sent, so this version’s link is closed.',
  revoked: 'This version’s link was withdrawn.',
  notSentYet: 'Not sent yet.',
  opened: (count: number) => (count === 1 ? 'Opened once.' : `Opened ${count} times.`),
  notOpened: 'Not opened yet.',
  failed: 'That did not work. Reload the page and try again.',
  offline: 'The connection dropped. Try again.',
} as const
