import { getPayload } from 'payload'

import { env } from '../lib/env'
import { rekeyTotpSecrets } from '../lib/security/rekeyTotpSecrets'
import config from '../payload.config'

/**
 * `pnpm totp:rekey` (docs/08 §9), run by every deployment's build after the migrations: while
 * PAYLOAD_SECRET_PREVIOUS is set, it moves staff two-factor secrets from the previous key to
 * PAYLOAD_SECRET and logs the counts; otherwise it does nothing. Safe to repeat.
 */
const { PAYLOAD_SECRET, PAYLOAD_SECRET_PREVIOUS } = env()
if (!PAYLOAD_SECRET_PREVIOUS) {
  console.info('PAYLOAD_SECRET_PREVIOUS is not set: no two-factor secrets to move.')
  process.exit(0)
}
const payload = await getPayload({ config })
const { moved, unreadable } = await rekeyTotpSecrets(payload, {
  current: PAYLOAD_SECRET,
  previous: PAYLOAD_SECRET_PREVIOUS,
})
payload.logger.info(
  `Two-factor secrets moved to the current key: ${moved}. Opened by neither key: ${unreadable}.`,
)
process.exit(0)
