import 'server-only'

/**
 * What the privacy page calls in the other slices (docs/20 §13): builder A's sign-in, sessions and
 * the account's life, and builder B's `ownPersonIds`. Slice C calls them only through this file,
 * and its tests mock this one module, so it stays as a list of re-exports, with no wrappers: C's
 * pages, B's layout and `src/lib/accounts/scope.ts` then share A's one request-cached
 * `getAccountSession`.
 *
 * `whatsAppCodesOpen` is A's `whatsappCodesOpenHere` under the name slice C calls it by: it is not
 * in the contract, and both its arguments are optional (the request and the time).
 */

export { closeAccount } from '../lifecycle'
export {
  confirmDetail,
  requestDetailCode,
  whatsappCodesOpenHere as whatsAppCodesOpen,
} from '../details'
export { ownPersonIds } from '../scope'
export {
  getAccountSession,
  listDevices,
  requireAccount,
  signOut,
  signOutEverywhere,
} from '../session'
