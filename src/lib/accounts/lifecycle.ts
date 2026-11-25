import 'server-only'

import type { CloseAccountsOfPerson } from './contract'

/**
 * The account's life (docs/20 §7.6; builder A): creating, closing, ending sessions, detaching.
 *
 * STUB until builder A lands (docs/20 §12, H7): the erasure an owner confirms calls this in its
 * transaction (src/lib/privacy/erasure.ts). It does nothing yet, which is right while nothing can
 * make an account; the erasure itself already empties the record's `account` link. Builder A
 * replaces it with the real one: close the account whose own record it is (Better Auth's user,
 * sessions and codes, the account row, `close-account` audited, no A2) and detach the record from
 * any other account.
 */
export const closeAccountsOfPerson: CloseAccountsOfPerson = async () => ({ closed: 0, detached: 0 })
