import type { payloadTotp } from 'payload-totp'

/**
 * Staff two-factor (docs/08 §9: TOTP mandatory for every staff account), through payload-totp
 * 3.0.7, reviewed before adoption. `forceSetup` sends anyone without an authenticator to set
 * one up before they can reach any data, and refuses removing it; SHA-1, six digits and 30
 * seconds are what every common authenticator app supports.
 */
export const TOTP_OPTIONS: Parameters<typeof payloadTotp>[0] = {
  collection: 'users',
  forceSetup: true,
  totp: { issuer: 'IIIC', algorithm: 'SHA1', digits: 6, period: 30 },
}
