import { createLocalReq, getPayload } from 'payload'

import { env } from '../lib/env'
import { rekeyNotes } from '../lib/notes/rekey'
import config from '../payload.config'

/**
 * `pnpm notes:rekey` (docs/18 §3; the runbook's key rotation), run by every deployment's build
 * after the migrations and `totp:rekey`: re-seals every session note still under
 * NOTES_ENCRYPTION_KEY_PREVIOUS with NOTES_ENCRYPTION_KEY and logs the counts, never a note. Without
 * a notes key it does nothing, so a deployment without notes still builds. Safe to repeat; the
 * previous key may be deleted once a run moves none and finds none unreadable.
 */
const { NOTES_ENCRYPTION_KEY } = env()
if (!NOTES_ENCRYPTION_KEY) {
  console.info('NOTES_ENCRYPTION_KEY is not set: no session notes to re-seal.')
  process.exit(0)
}
const payload = await getPayload({ config })
const result = await rekeyNotes(await createLocalReq({}, payload))
if (result.ok) {
  payload.logger.info(
    `Session notes re-sealed under the current key: ${result.value.moved}. Opened by no key held: ${result.value.unreadable}.`,
  )
}
process.exit(0)
