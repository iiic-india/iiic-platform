import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { VERIFY_PATH } from '@/lib/certificates/token'
import { env } from '@/lib/env'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok, type Result } from '@/lib/result'
import { SITE_NAME } from '@/lib/seo/site'
import { formatIstDate } from '@/lib/time/ist'
import type { Certificate, Person } from '@/payload-types'

import { Frame } from '../components/Frame'
import { Button } from '../components/parts'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, PlainLink, siteLink } from './text'

/**
 * C5 · the certificate email (docs/06 C5; docs/18 §4; D-39): to the holder, once the office has
 * issued it. It names the certificate as the kit's template does ("Certificate of Completion"),
 * its ID, the programme and the day it was completed, and gives the verification page for the ID
 * and LinkedIn's add-to-profile link. The PDF is in the private bucket, which has no signed link
 * for a client yet: the email offers it by reply, as B3's receipt does (docs/19 §10). The verify
 * page's QR token is kept as a hash only, so the link is the page for the typed ID, which shows
 * the holder's initials (docs/18 §8). Never "degree", "diploma", "accredited" or "recognised"
 * (CLAUDE.md #9). Copy status: a candidate, awaiting IIIC's approval (I-41) and I-14's wording.
 */

const CertificateData = z.object({
  firstName: z.string(),
  certificateId: z.string().min(1),
  programmeName: z.string().min(1),
  completedOn: z.string().min(1),
  verifyPath: z.string().startsWith(VERIFY_PATH),
  linkedInUrl: z.string().startsWith('https://www.linkedin.com/profile/add?'),
})
type CertificateData = z.infer<typeof CertificateData>

/**
 * LinkedIn's add-to-profile link for a certification (its documented `startTask` parameters):
 * the programme, IIIC by name, the month and year it was issued, the ID and the page that
 * verifies it.
 */
export function linkedInAddUrl(input: {
  programmeName: string
  issuedAt: Date
  certificateId: string
  verifyUrl: string
}): string {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: input.programmeName,
    organizationName: SITE_NAME,
    issueYear: String(input.issuedAt.getUTCFullYear()),
    issueMonth: String(input.issuedAt.getUTCMonth() + 1),
    certId: input.certificateId,
    certUrl: input.verifyUrl,
  })
  return `https://www.linkedin.com/profile/add?${params.toString()}`
}

/** C5's data, read when it is sent: `stale` once the certificate has been revoked. */
export async function loadCertificate(
  req: PayloadRequest,
  certificateId: number,
  siteUrl: string,
): Promise<Result<CertificateData, LoadError>> {
  const certificate = (await req.payload.findByID({
    collection: 'certificates',
    id: certificateId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Certificate | null
  if (!certificate) return err({ code: 'not-found' })
  if (certificate.status !== 'valid') return err({ code: 'stale' })
  const personId = idOf(certificate.person)
  const person =
    personId === null
      ? null
      : ((await req.payload.findByID({
          collection: 'people',
          id: Number(personId),
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          select: { fullName: true },
          req,
        })) as Pick<Person, 'fullName'> | null)
  const issuedAt = new Date(certificate.issuedAt ?? certificate.createdAt)
  const verifyPath = `${VERIFY_PATH}?id=${encodeURIComponent(certificate.certificateId)}`
  const parsed = CertificateData.safeParse({
    firstName: person?.fullName?.trim().split(/\s+/)[0] ?? '',
    certificateId: certificate.certificateId,
    programmeName: certificate.programmeName,
    completedOn: formatIstDate(new Date(`${certificate.completedOn}T12:00:00+05:30`)),
    verifyPath,
    linkedInUrl: linkedInAddUrl({
      programmeName: certificate.programmeName,
      issuedAt,
      certificateId: certificate.certificateId,
      verifyUrl: siteLink(siteUrl, verifyPath),
    }),
  })
  return parsed.success ? ok(parsed.data) : err({ code: 'not-found' })
}

export const certificateIssued: TemplateImplementation<CertificateData> = {
  load: (req, { subject }) => loadCertificate(req, subject.id, env().siteUrl),
  email: {
    key: 'certificate-issued',
    schema: CertificateData,
    subject: (data) => `Your Certificate of Completion, ${data.certificateId}`,
    preheader: (data) => `For ${data.programmeName}. Anyone can check it by its ID.`,
    element: (data, context) => (
      <Frame
        preheader={`For ${data.programmeName}. Anyone can check it by its ID.`}
        eyebrow="Certificate of Completion"
        heading={data.firstName ? `${data.firstName}, your certificate` : 'Your certificate'}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>
          IIIC has issued your Certificate of Completion for {data.programmeName}, completed on{' '}
          {data.completedOn}. Its ID is {data.certificateId}.
        </Para>
        <Para>
          Anyone can check it on IIIC’s website with that ID; the page shows whether it is valid.
        </Para>
        <Button href={siteLink(context.siteUrl, data.verifyPath)}>Check the certificate</Button>
        <Para>
          To add it to your LinkedIn profile:{' '}
          <PlainLink href={data.linkedInUrl}>add it to LinkedIn</PlainLink>.
        </Para>
        <Para>For the certificate as a PDF, reply to this email.</Para>
      </Frame>
    ),
  },
}
