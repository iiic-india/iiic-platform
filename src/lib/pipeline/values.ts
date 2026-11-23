/**
 * The pipeline's other vocabularies (docs/04 B2B; docs/17-pipeline-design.md §2–§5): where a lead
 * came from, team sizes, what an activity, a task, an enquiry and a proposal can be, and the
 * moves a task and a proposal may make. The collections' select options are built from these
 * lists. Nothing here is a fact about IIIC; the team-size bands and the labels are proposed for
 * IIIC to confirm (docs/17 §10).
 */

/** Where a lead came from (docs/04 `leads.source`; F12: a partnership's source is the Institute). */
export const LEAD_SOURCES = [
  { value: 'teamMapForm', label: 'Team Map request' },
  { value: 'partnershipForm', label: 'Partnership enquiry (Institute)' },
  { value: 'proposalCall', label: 'Proposal call booked' },
  { value: 'office', label: 'Entered by the office' },
] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]['value']

/** A team's size, as the Team Map request asks it (docs/03 F5). Bands proposed (docs/17 §10). */
export const TEAM_SIZE_BANDS = [
  { value: 'upTo10', label: 'Up to 10 people' },
  { value: 'from11to50', label: '11 to 50 people' },
  { value: 'from51to200', label: '51 to 200 people' },
  { value: 'from201to500', label: '201 to 500 people' },
  { value: 'over500', label: 'More than 500 people' },
] as const

export type TeamSizeBand = (typeof TEAM_SIZE_BANDS)[number]['value']

/** A company, or an institution that partners with the institute (F12). Proposed. */
export const ORGANISATION_TYPES = [
  { value: 'business', label: 'Business' },
  { value: 'institution', label: 'University or institution' },
] as const

export type OrganisationType = (typeof ORGANISATION_TYPES)[number]['value']

/**
 * What a lead's timeline entry records (docs/04 `lead_activities.type`), with three the platform
 * writes: a request received, a proposal made or sent or answered, a proposal call booked.
 */
export const ACTIVITY_TYPES = [
  { value: 'note', label: 'Note' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'stageChange', label: 'Stage change' },
  { value: 'file', label: 'File' },
  { value: 'enquiry', label: 'Request received' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'booking', label: 'Call booked' },
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]['value']

/** The entries staff write by hand; the rest are the platform's. */
export const STAFF_ACTIVITY_TYPES = [
  'note',
  'call',
  'email',
  'whatsapp',
  'file',
] as const satisfies readonly ActivityType[]

/**
 * Work for a person (docs/06, Engine rules: Ownership): the first reply to a request (P1, P7),
 * the follow-up after a proposal (P5), the drafted follow-up to review (P6, M6), anything else.
 */
export const TASK_KINDS = [
  { value: 'firstReply', label: 'Reply to the request' },
  { value: 'proposalFollowUp', label: 'Follow up the proposal' },
  { value: 'reviewFollowUpDraft', label: 'Review the drafted follow-up' },
  { value: 'other', label: 'Other' },
] as const

export type TaskKind = (typeof TASK_KINDS)[number]['value']

export const TASK_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]['value']

/** A task is done or cancelled once; a slip is put right with a new task. */
export const TASK_MOVES: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  open: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

/** The role a task waits on (docs/06: "assigns it to a role and shows on Today"). */
export const TASK_ROLES = [
  { value: 'operator', label: 'Operator' },
  { value: 'owner', label: 'Owner' },
] as const

export type TaskRole = (typeof TASK_ROLES)[number]['value']

/** The public forms that make an enquiry (docs/03 F5, F12). */
export const ENQUIRY_KINDS = [
  { value: 'teamMap', label: 'Team Map request' },
  { value: 'partnership', label: 'Partnership enquiry' },
] as const

export type EnquiryKind = (typeof ENQUIRY_KINDS)[number]['value']

/** An enquiry stays as received unless the office marks it as spam. */
export const ENQUIRY_STATUSES = [
  { value: 'received', label: 'Received' },
  { value: 'spam', label: 'Spam' },
] as const

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number]['value']

/** What the platform did with an enquiry: a new lead, or the open lead it matched. */
export const ENQUIRY_OUTCOMES = [
  { value: 'newLead', label: 'New lead' },
  { value: 'existingLead', label: 'Added to an open lead' },
] as const

export type EnquiryOutcome = (typeof ENQUIRY_OUTCOMES)[number]['value']

/** Whether Turnstile checked the person (docs/08 §9): only where its keys are set. */
export const TURNSTILE_OUTCOMES = [
  { value: 'passed', label: 'Passed' },
  { value: 'off', label: 'Not configured' },
] as const

/** How far the first-reply clock has run on a lead still in New (P3; docs/05 Today). */
export const UNTOUCHED_LEVELS = [
  { value: 'amber', label: 'Waiting over 24 hours' },
  { value: 'red', label: 'Waiting over 48 hours' },
] as const

export type UntouchedLevel = (typeof UNTOUCHED_LEVELS)[number]['value']

/**
 * A proposal's life (docs/04 `proposals.status`; docs/17 §5). Sent and viewed follow the version
 * the client holds; accepted and declined are what the client said, recorded by the office;
 * expired is a proposal past its "valid until" day with no answer.
 */
export const PROPOSAL_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
] as const

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]['value']

/**
 * The moves a proposal may make. A sent, viewed or expired proposal goes back to draft when the
 * office revises it; the new version is sent as the old one was. Accepted and declined are final.
 */
export const PROPOSAL_MOVES: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  draft: ['sent'],
  sent: ['viewed', 'accepted', 'declined', 'expired', 'draft'],
  viewed: ['accepted', 'declined', 'expired', 'draft'],
  expired: ['draft'],
  accepted: [],
  declined: [],
}
