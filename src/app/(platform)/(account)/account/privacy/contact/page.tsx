import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AddDetailFlow } from '@/components/account/privacy/AddDetailFlow'
import styles from '@/components/account/privacy/privacy.module.css'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import type { SignInChannel } from '@/lib/accounts/contract'
import { DETAIL_COPY, PRIVACY_COPY_STATUS } from '@/lib/accounts/privacy/copy'
import { CONTACT_PATH, PRIVACY_PATH } from '@/lib/accounts/privacy/outcome'
import { openMyIiic, whatsAppCodesOpen } from '@/lib/accounts/privacy/seams'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const channelIn = (value: string | string[] | undefined): SignInChannel =>
  value === 'whatsapp' ? 'whatsapp' : 'email'

// A fixed title: nothing about the request is read before the session (CLAUDE.md #6).
export const metadata: Metadata = {
  title: { absolute: DETAIL_COPY.title },
  robots: { index: false, follow: false },
}

/**
 * `/account/privacy/contact` (docs/20 §4.6, §7.5): adds the contact detail the account lacks, an
 * email to a WhatsApp account or, once codes on WhatsApp are open, a mobile to an email account,
 * by a code to it. A detail the account already has, or a mobile while WhatsApp codes are closed,
 * leads back to the privacy page.
 */
export default async function ContactDetailPage({ searchParams }: Props) {
  const account = await openMyIiic(PRIVACY_PATH)
  const channel = channelIn((await searchParams).channel)
  const held = channel === 'email' ? account.verified.email : account.verified.mobile
  if (held || (channel === 'whatsapp' && !(await whatsAppCodesOpen()))) {
    redirect(`${PRIVACY_PATH}#contact`)
  }
  const copy = DETAIL_COPY[channel]
  return (
    <div className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={PRIVACY_COPY_STATUS} />
      <h1>{copy.heading}</h1>
      <div className={styles.stack}>
        <AddDetailFlow
          channel={channel}
          permalink={`${CONTACT_PATH}?channel=${channel}`}
          back={`${PRIVACY_PATH}#contact`}
        />
      </div>
    </div>
  )
}
