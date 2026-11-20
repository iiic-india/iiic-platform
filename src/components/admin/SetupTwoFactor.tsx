import { MinimalTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import { Secret, TOTP } from 'otpauth'
import type { AdminViewServerProps } from 'payload'
import { toDataURL } from 'qrcode'

import { safeBack } from '@/lib/auth/safeBack'
import { TOTP_OPTIONS } from '@/lib/auth/totp'
import { TOTP_COPY, TWO_FACTOR_COPY } from '@/plugins/totpCopy'

import { CopyButton } from './CopyButton'
import styles from './TwoFactor.module.css'
import { TwoFactorCodeForm } from './TwoFactorCodeForm'

/** The key in groups of four, as authenticator apps show it. */
const grouped = (key: string) => key.match(/.{1,4}/g)?.join(' ') ?? key

/**
 * Setting up an authenticator, which every staff account must do before reaching anything
 * (src/lib/auth/totp.ts: forceSetup). Replaces payload-totp's setup view (same keys and path)
 * to ask for the code in one labelled field; the plugin's /api/setup-totp still checks the
 * code against the new secret and stores it.
 */
export async function SetupTwoFactor({ initPageResult, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const {
    routes: { admin: adminRoute, api: apiRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user as { email?: string; hasTotp?: boolean } | null
  if (!user) redirect(`${serverURL}${adminRoute}/login`)
  if (user.hasTotp) redirect(`${serverURL}${adminRoute}`)

  // 160 bits, the length RFC 4226 recommends; a new one on every visit until a code confirms it.
  const secret = new Secret({ size: 20 })
  const { issuer, algorithm, digits, period } = TOTP_OPTIONS.totp ?? {}
  const uri = new TOTP({ issuer, label: user.email, algorithm, digits, period, secret }).toString()
  const qr = await toDataURL(uri, { margin: 1, width: 456 })

  return (
    <MinimalTemplate>
      <h1>{TOTP_COPY.setup.title}</h1>
      <p>{TOTP_COPY.setup.description}</p>
      {/* A data URL made here, so there is nothing for next/image to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.qr} src={qr} alt={TWO_FACTOR_COPY.qrAlt} width={228} height={228} />
      <details className={styles.disclosure}>
        <summary>{TOTP_COPY.setup.addCodeManually}</summary>
        <p>{TWO_FACTOR_COPY.setupKeyIntro}</p>
        <div className={styles.key}>
          <code>{grouped(secret.base32)}</code>
          <CopyButton
            value={secret.base32}
            label={TWO_FACTOR_COPY.copyKey}
            copied={TWO_FACTOR_COPY.keyCopied}
          />
        </div>
      </details>
      <p>{TOTP_COPY.setup.enterCode}</p>
      <TwoFactorCodeForm
        endpoint={`${serverURL}${apiRoute}/setup-totp`}
        next={safeBack(searchParams?.back, adminRoute)}
        submitLabel={TWO_FACTOR_COPY.setupSubmit}
        secret={secret.base32}
      />
    </MinimalTemplate>
  )
}
