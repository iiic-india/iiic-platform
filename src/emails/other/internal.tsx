import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { hasRole, type Role } from '@/access/roles'
import { readDigestFacts, readReportFacts } from '@/lib/automations/operations/facts'
import { digestSections, reportSections } from '@/lib/automations/operations/sections'
import { err, ok, type Result } from '@/lib/result'
import { formatIstDate } from '@/lib/time/ist'

import { Frame } from '../components/Frame'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, SectionHeading } from './text'

/**
 * The staff emails of builder C (docs/06 O1, O2, O10; docs/13 §8; docs/19 §9): the daily digest
 * at 08:30 IST to active owners and operators, and the weekly report on Monday at 09:00 IST to
 * owners, both from `platform@` with no reply address and no footer link. Each `load` reads the
 * counts at send time, so a digest sent late still tells the truth, and answers `stale` when the
 * account is no longer active or has lost the role. Counts and references only: no client's name.
 * Labels are interface copy (VOICE.md, "Interface copy"), candidates for I-41.
 */

const SectionData = z.object({ title: z.string(), lines: z.array(z.string()) })
const StaffEmailData = z.object({ day: z.string(), sections: z.array(SectionData) })
type StaffEmailData = z.infer<typeof StaffEmailData>

async function activeStaff(
  req: PayloadRequest,
  recipient: { kind: string; id: number },
  roles: Role[],
): Promise<boolean> {
  if (recipient.kind !== 'staff') return false
  const user = await req.payload.findByID({
    collection: 'users',
    id: recipient.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return hasRole(user, ...roles)
}

/** Who receives each: the digest goes to owners and operators, the report to owners. */
export const DIGEST_ROLES: Role[] = ['owner', 'operator']
export const REPORT_ROLES: Role[] = ['owner']

function StaffEmail({
  data,
  heading,
  context,
}: {
  data: StaffEmailData
  heading: string
  context: Parameters<NonNullable<TemplateImplementation['email']>['element']>[1]
}) {
  return (
    <Frame
      preheader={`${heading}, ${data.day}`}
      eyebrow="IIIC Platform"
      heading={heading}
      footer={context.footer}
      assetUrl={context.assetUrl}
    >
      {data.sections.map((section) => (
        <div key={section.title}>
          <SectionHeading>{section.title}</SectionHeading>
          {section.lines.map((line) => (
            <Para key={line}>{line}</Para>
          ))}
        </div>
      ))}
    </Frame>
  )
}

export const dailyDigest: TemplateImplementation<StaffEmailData> = {
  load: async (req, { recipient }): Promise<Result<StaffEmailData, LoadError>> => {
    if (!(await activeStaff(req, recipient, DIGEST_ROLES))) return err({ code: 'stale' })
    const now = new Date()
    return ok({
      day: formatIstDate(now),
      sections: digestSections(await readDigestFacts(req, now)),
    })
  },
  email: {
    key: 'daily-digest',
    schema: StaffEmailData,
    subject: (data) => `Today at IIIC, ${data.day}`,
    preheader: (data) => `Today at IIIC, ${data.day}`,
    element: (data, context) => (
      <StaffEmail data={data} heading="Today at IIIC" context={context} />
    ),
  },
}

export const weeklyReport: TemplateImplementation<StaffEmailData> = {
  load: async (req, { recipient }) => {
    if (!(await activeStaff(req, recipient, REPORT_ROLES))) return err({ code: 'stale' })
    const now = new Date()
    return ok({
      day: formatIstDate(now),
      sections: reportSections(await readReportFacts(req, now)),
    })
  },
  email: {
    key: 'weekly-report',
    schema: StaffEmailData,
    subject: (data) => `The week at IIIC, to ${data.day}`,
    preheader: (data) => `The week at IIIC, to ${data.day}`,
    element: (data, context) => (
      <StaffEmail data={data} heading="The week at IIIC" context={context} />
    ),
  },
}
