import { MinimalTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { safeBack } from '@/lib/auth/safeBack'
import { TOTP_COPY, TWO_FACTOR_COPY } from '@/plugins/totpCopy'

import { TwoFactorCodeForm } from './TwoFactorCodeForm'

/**
 * The code after the password. Replaces payload-totp's verify view (same keys and path,
 * src/payload.config.ts) to ask for the code in one labelled field; the plugin's
 * /api/verify-totp still checks it and counts the attempt.
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
  return (
    <MinimalTemplate>
      <h1>{TOTP_COPY.verify.title}</h1>
      <p>{TOTP_COPY.setup.enterCode}</p>
      <TwoFactorCodeForm
        endpoint={`${serverURL}${apiRoute}/verify-totp`}
        next={safeBack(searchParams?.back, adminRoute)}
        submitLabel={TWO_FACTOR_COPY.verifySubmit}
      />
    </MinimalTemplate>
  )
}
