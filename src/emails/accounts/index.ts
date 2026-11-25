import type { TemplateImplementation, TemplateImplementations } from '../types'
import { accountClosed, accountDetailAdded, accountSignInCode } from './messages'

/**
 * The account messages' implementations (Release 2; docs/20 §9): `account-sign-in-code` (A1),
 * `account-closed` (A2) and `account-detail-added` (A3), each a `load` and an `email`, and for
 * A1 a `whatsapp` with the code as its one variable (Meta's authentication template). A1's
 * `load` reads the code and the address from `transient` only and answers `stale` without them,
 * so a retry sends nothing. Written in ./messages.tsx to src/brand/VOICE.md; candidate copy
 * (I-41).
 */
const register = <Data>(implementation: TemplateImplementation<Data>) =>
  implementation as unknown as TemplateImplementation<never>

export const ACCOUNT_TEMPLATES: TemplateImplementations = {
  'account-sign-in-code': register(accountSignInCode),
  'account-closed': register(accountClosed),
  'account-detail-added': register(accountDetailAdded),
}
