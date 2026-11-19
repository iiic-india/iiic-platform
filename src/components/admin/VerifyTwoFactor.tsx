import { MinimalTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { TOTP_COPY } from '@/plugins/totpCopy'

import { VerifyTwoFactorForms } from './VerifyTwoFactorForms'

/**
 * The two-factor check after the password. It replaces payload-totp's own view so that it can
 * also take a recovery code (src/lib/auth/recoveryEndpoints.ts); the code itself is still
 * checked by the plugin's /api/verify-totp.
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
  const back = typeof searchParams?.back === 'string' ? searchParams.back : undefined
  return (
    <MinimalTemplate>
      <h1>{TOTP_COPY.verify.title}</h1>
      <p>{TOTP_COPY.setup.enterCode}</p>
      <VerifyTwoFactorForms
        adminRoute={adminRoute}
        apiRoute={apiRoute}
        back={back}
        serverURL={serverURL}
      />
    </MinimalTemplate>
  )
}
