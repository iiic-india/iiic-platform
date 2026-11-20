import { Secret, TOTP } from 'otpauth'
import { toDataURL } from 'qrcode'

import { TOTP_OPTIONS } from './totp'

/**
 * A new TOTP secret for an account, with the QR code an authenticator app scans: 160 bits, the
 * length RFC 4226 recommends. Used by the setup view and by recovery
 * (src/lib/auth/recoveryEndpoints.ts), so both give the same kind of key.
 */
export async function newAuthenticator(email: string | undefined) {
  const secret = new Secret({ size: 20 })
  const { issuer, algorithm, digits, period } = TOTP_OPTIONS.totp ?? {}
  const uri = new TOTP({ issuer, label: email, algorithm, digits, period, secret }).toString()
  return { secret: secret.base32, qr: await toDataURL(uri, { margin: 1, width: 456 }) }
}
