import type { TemplateImplementations } from '../types'

/**
 * The account messages' implementations (Release 2; docs/20 §9): `account-sign-in-code` (A1),
 * `account-closed` (A2) and `account-detail-added` (A3), each a `load`, an `email` and, for A1, a
 * `whatsapp` with the code as its one variable. Written by the accounts' builder A in this folder,
 * to src/brand/VOICE.md and checked with /copy-check; A1's `load` reads the code and the address
 * from `transient` only and answers `stale` without them, so a retry sends nothing.
 *
 * STUB until builder A lands: empty, so the core answers `template-missing` for these keys and
 * sends nothing. Nothing plans these messages before builder A's sign-in action exists.
 */
export const ACCOUNT_TEMPLATES: TemplateImplementations = {}
