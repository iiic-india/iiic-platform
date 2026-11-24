import 'server-only'

import type { PurgeSignIns } from './contract'

/**
 * What sign-in leaves behind, removed nightly by O5 (docs/20 §4.8; D-116; builder A).
 *
 * STUB until builder A lands (docs/20 §12, H9): O5-retention calls it every night
 * (src/lib/automations/operations/run.ts). It removes nothing yet, which is right while nothing
 * writes a sign-in request or a Better Auth session. Builder A replaces it with the real one:
 * `sign-in-requests` older than SIGN_IN_REQUEST_KEEP_HOURS, and Better Auth's expired sessions
 * and codes in `customer_auth`.
 */
export const purgeSignIns: PurgeSignIns = async () => ({ requests: 0, sessions: 0, codes: 0 })
