import type { PayloadRequest, Where } from 'payload'

import { domainOf } from '../fields'
import { FREE_MAIL_DOMAINS, type FindMatches, type KeysFor, type Matches } from '../matching'
import { FINAL_STAGES, type LeadKind } from '../stages'
import type { OrganisationType } from '../values'

/**
 * How a request finds what IIIC already holds (docs/17 §4; src/lib/pipeline/matching.ts). Reads
 * only: matching links a request to a record and never changes one. Free of `server-only`, as the
 * organisations' hook works out the same keys.
 */

/** Legal forms dropped from the end of a name before it is compared, longest first. */
const LEGAL_FORMS = [
  'private limited',
  'pvt limited',
  'private ltd',
  'pvt ltd',
  'limited',
  'ltd',
  'llp',
  'inc',
] as const

/**
 * A name as matching compares it: small letters, "&" read as "and", every run of punctuation and
 * space folded to one space, and a trailing legal form dropped ("Acme Pvt. Ltd." is "acme").
 */
export function nameKeyOf(name: string): string {
  const folded = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  for (const form of LEGAL_FORMS) {
    // A name that is nothing but a legal form keeps it.
    if (folded === form) return folded
    if (folded.endsWith(` ${form}`)) return folded.slice(0, -form.length - 1).trim()
  }
  return folded
}

/** The domain of an email address, unless anyone can sign up there (FREE_MAIL_DOMAINS). */
export function workDomainOf(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
  if (!domain || (FREE_MAIL_DOMAINS as readonly string[]).includes(domain)) return null
  return domain
}

/** The website's host without "www.", else the work email's domain; and the name's key. */
export const keysFor: KeysFor = ({ name, website, email }) => ({
  domain: (website ? domainOf(website) : null) ?? workDomainOf(email),
  nameKey: nameKeyOf(name),
})

/** The organisation type a lead's kind deals with: a business, or an institution (F12). */
export function organisationTypeFor(kind: LeadKind): OrganisationType {
  return kind === 'partnership' ? 'institution' : 'business'
}

const OPEN: Where = { stage: { not_in: [...FINAL_STAGES] } }
const ENDED: Where = { stage: { in: [...FINAL_STAGES] } }

async function firstId(
  req: PayloadRequest,
  collection: 'people' | 'organisations' | 'leads',
  where: Where,
  sort: string,
): Promise<number | null> {
  const { docs } = await req.payload.find({
    collection,
    where,
    sort,
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const id = docs[0]?.id
  return typeof id === 'number' ? id : null
}

/** The lead of a kind an organisation or a person has, open or ended, newest first. */
async function leadOf(
  req: PayloadRequest,
  kind: LeadKind,
  owner: { organisation: number | null; person: number | null },
  state: Where,
): Promise<number | null> {
  for (const [field, id] of [
    ['organisation', owner.organisation],
    ['person', owner.person],
  ] as const) {
    if (id === null) continue
    const found = await firstId(
      req,
      'leads',
      { and: [{ kind: { equals: kind } }, { [field]: { equals: id } }, state] },
      '-createdAt',
    )
    if (found !== null) return found
  }
  return null
}

/**
 * The records a request matches (src/lib/pipeline/matching.ts): the person by email, else by
 * mobile, the email winning a disagreement; the organisation of the kind's type by its website's
 * host, then its work email's domain, then its name key; the open lead of the kind, the
 * organisation's first, else the person's; and, when there is none, the newest ended one.
 */
export const findMatches: FindMatches = async (req, { kind, email, mobile, organisation }) => {
  const byEmail = await firstId(
    req,
    'people',
    { email: { equals: email.trim().toLowerCase() } },
    'createdAt',
  )
  const byMobile = mobile
    ? await firstId(req, 'people', { mobile: { equals: mobile } }, 'createdAt')
    : null
  const personId = byEmail ?? byMobile
  const conflict =
    byEmail !== null && byMobile !== null && byEmail !== byMobile ? 'emailAndMobileDiffer' : null

  const type = organisationTypeFor(kind)
  const domains = [...new Set([organisation.domain, workDomainOf(email)])].filter(
    (domain): domain is string => Boolean(domain),
  )
  let organisationId: number | null = null
  for (const domain of domains) {
    organisationId = await firstId(
      req,
      'organisations',
      { and: [{ type: { equals: type } }, { domain: { equals: domain } }] },
      'createdAt',
    )
    if (organisationId !== null) break
  }
  if (organisationId === null && organisation.nameKey) {
    organisationId = await firstId(
      req,
      'organisations',
      { and: [{ type: { equals: type } }, { nameKey: { equals: organisation.nameKey } }] },
      'createdAt',
    )
  }

  const owners = { organisation: organisationId, person: personId }
  const openLeadId = await leadOf(req, kind, owners, OPEN)
  const previousLeadId = openLeadId === null ? await leadOf(req, kind, owners, ENDED) : null
  const matches: Matches = { personId, organisationId, openLeadId, previousLeadId, conflict }
  return matches
}
