import type { Metadata } from 'next'
import { createLocalReq, getPayload } from 'payload'

import styles from '@/components/account/privacy/privacy.module.css'
import {
  AgreedSection,
  CloseSection,
  ContactSection,
  DevicesSection,
  MessagesSection,
  RequestsSection,
} from '@/components/account/privacy/PrivacySections'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { listOwnConsents } from '@/lib/accounts/privacy/consents'
import {
  AGREED_COPY,
  CLOSE_COPY,
  CONTACT_COPY,
  DEVICES_COPY,
  MESSAGES_COPY,
  PAGE_COPY,
  PRIVACY_COPY_STATUS,
  REQUEST_COPY,
} from '@/lib/accounts/privacy/copy'
import { PRIVACY_PATH, readOutcome } from '@/lib/accounts/privacy/outcome'
import { listOwnRequests } from '@/lib/accounts/privacy/requests'
import { signedInRecently } from '@/lib/accounts/privacy/rules'
import { listDevices, openMyIiic, whatsAppCodesOpen } from '@/lib/accounts/privacy/seams'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: PAGE_COPY.title },
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const SECTION_LINKS = [
  { id: 'agreed', label: AGREED_COPY.heading },
  { id: 'messages', label: MESSAGES_COPY.heading },
  { id: 'requests', label: REQUEST_COPY.heading },
  { id: 'contact', label: CONTACT_COPY.heading },
  { id: 'devices', label: DEVICES_COPY.heading },
  { id: 'close', label: CLOSE_COPY.heading },
] as const

/**
 * `/account/privacy` (docs/20 §7.5; builder C): what the person has agreed to, with a withdrawal
 * beside each consent in force; the marketing messages My IIIC may offer, each under its notice;
 * requests about their data, and the list of them; their contact details; their devices; and the
 * way to close the account. B's door first: the 404 while `accountsEnabled` is off, then the
 * session (CLAUDE.md #6; D-122); then only the account's own records, through its own
 * functions. No offer, recommendation or counselling detail appears here (CLAUDE.md #3; D-124),
 * and nothing about the visit is recorded (docs/20 §8).
 */
export default async function PrivacyPage({ searchParams }: Props) {
  const account = await openMyIiic(PRIVACY_PATH)
  const outcome = readOutcome(await searchParams)
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  const now = new Date()
  const consents = await listOwnConsents(req, account)
  const requests = await listOwnRequests(req, account)
  const devices = await listDevices(account)
  const mobileOpen = await whatsAppCodesOpen()

  return (
    <div className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={PRIVACY_COPY_STATUS} />
      <h1>{PAGE_COPY.heading}</h1>
      <p className="iiic-lede">{PAGE_COPY.lead}</p>
      <nav aria-label={PAGE_COPY.sections}>
        <ul className={styles.list}>
          {SECTION_LINKS.map((section) => (
            <li key={section.id}>
              <a className="iiic-link" href={`#${section.id}`}>
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <AgreedSection rows={consents} outcome={outcome} />
      <MessagesSection rows={consents} account={account} outcome={outcome} />
      <RequestsSection
        requests={requests}
        recent={signedInRecently(account, now)}
        outcome={outcome}
      />
      <ContactSection account={account} mobileOpen={mobileOpen} outcome={outcome} />
      <DevicesSection devices={devices} outcome={outcome} />
      <CloseSection />
    </div>
  )
}
