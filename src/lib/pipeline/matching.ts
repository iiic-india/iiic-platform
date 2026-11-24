import type { PayloadRequest } from 'payload'

import type { LeadKind } from './stages'

/**
 * How a request finds what IIIC already holds, so a repeat is matched rather than duplicated
 * (docs/17 §4), as contracts for builder A. A public form's details are unverified, so matching
 * only links: it never changes the person or the organisation it finds, and what the form said
 * stays on the enquiry for the office to compare. Merging two records is the office's (M5).
 */

/**
 * Mail services anyone can sign up to: an address there says nothing about the organisation, so
 * its domain is never used to match one. A technical list, kept short; add to it as needed.
 */
export const FREE_MAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'ymail.com',
  'rediffmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.in',
] as const

/**
 * What an organisation is matched by: its website's host (without "www."), else its work email's
 * domain unless that is a free mail service, and its name as compared: small letters, "&" read as
 * "and", punctuation and spaces folded, and a trailing legal form ("Pvt Ltd", "Private Limited",
 * "LLP", "Ltd", "Limited", "Inc") dropped.
 */
export type OrganisationKeys = { domain: string | null; nameKey: string }

export type KeysFor = (input: {
  name: string
  website?: string | null
  email?: string | null
}) => OrganisationKeys

/**
 * The records a request matches, each null when there is none:
 * - the person: the one whose email equals the form's (small letters), else whose mobile equals
 *   it (E.164); when the email and the mobile point at two different people, the email wins and
 *   `conflict` tells the office;
 * - the organisation: by domain first, then by name key, of the same type;
 * - the lead: the organisation's open lead of the same kind (not in a final stage), else the
 *   person's, newest first. A closed lead is never reopened: the new lead names it as
 *   `previousLead`.
 */
export type Matches = {
  personId: number | null
  organisationId: number | null
  openLeadId: number | null
  previousLeadId: number | null
  conflict: 'emailAndMobileDiffer' | null
}

export type FindMatches = (
  req: PayloadRequest,
  input: {
    kind: LeadKind
    email: string
    mobile: string | null
    organisation: OrganisationKeys
  },
) => Promise<Matches>
