import { MinimalTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { safeBack } from '@/lib/auth/safeBack'
import { TOTP_COPY, TWO_FACTOR_COPY } from '@/plugins/totpCopy'

import styles from './TwoFactor.module.css'
import { TwoFactorCodeForm } from './TwoFactorCodeForm'

/**
 * The code after the password. Replaces payload-totp's verify view (same keys and path,
 * src/payload.config.ts) to ask for the code in one labelled field, and to take a recovery code
 * instead (src/lib/auth/recoveryEndpoints.ts); the plugin's /api/verify-totp still checks the
 * code and counts the attempt.
 */
export function VerifyTwoFactor({ initPageResult, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult
  const {
    routes: { admin: adminRoute, api: apiRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user as { hasTotp?: boolean; _strategy?: string } | null
  if (!user) redirect(`${serverURL}${adminRoute}/login`)
  if (!user.hasTotp || user._strategy === 'totp') redirect(`${serverURL}${adminRoute}`)
  const next = safeBack(searchParams?.back, adminRoute)
  return (
    <MinimalTemplate>
      <h1>{TOTP_COPY.verify.title}</h1>
      <p>{TOTP_COPY.setup.enterCode}</p>
      <TwoFactorCodeForm
        endpoint={`${serverURL}${apiRoute}/verify-totp`}
        next={next}
        submitLabel={TWO_FACTOR_COPY.verifySubmit}
      />
      <details className={styles.recovery}>
        <summary>{TWO_FACTOR_COPY.lostAuthenticator}</summary>
        <p>{TWO_FACTOR_COPY.recoveryIntro}</p>
        <TwoFactorCodeForm
          kind="recovery"
          endpoint={`${serverURL}${apiRoute}/users/recover-two-factor`}
          next={`${adminRoute}/setup-totp?back=${encodeURIComponent(next)}`}
          submitLabel={TWO_FACTOR_COPY.recoverySubmit}
          buttonStyle="secondary"
        />
      </details>
    </MinimalTemplate>
  )
}
