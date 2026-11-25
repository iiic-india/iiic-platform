import 'server-only'

import { createLocalReq, getPayload, type PayloadRequest } from 'payload'

import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { err, ok } from '@/lib/result'
import { IST } from '@/lib/time/ist'
import config from '@payload-config'

import { accountActor, accountVerifying, attachEarlierRecords, DETAIL_FIELDS } from './attach'
import {
  detailRequestInput,
  verifyCodeInput,
  type AccountSession,
  type ConfirmDetail,
  type RequestDetailCode,
  type SignInChannel,
} from './contract'
import { clearAttempt, readAttempt } from './signIn/cookie'
import { nextSignInDeps, secretOf, secureCookies, signInOpen } from './signIn/deps'
import { deploymentGate } from './signIn/gate'
import { normaliseIdentifier } from './signIn/identifier'
import { checkCode, issueCode, triesLeft, whatsappCodesOpen } from './signIn/issue'
import { openFor, type SignInWiring } from './signIn/steps'

/**
 * A second detail (docs/20 §4.6; D-120): from My IIIC the person adds the detail they did not
 * sign in with, an email to a WhatsApp account or a mobile to an email account once WhatsApp
 * codes are open. The same code machinery runs, with purpose `addDetail` in `sign-in-requests`
 * and the same limits. The address and the code are entered on the privacy page,
 * `/account/privacy/contact` (builder C's; D-128), which only a signed-in person can open.
 *
 * A right code marks the detail proven on the account's own record, gives it to Better Auth's
 * user, attaches the records holding it (§6), writes `add-contact-detail`, and sends A3 to the
 * email held before. A detail already proven on another account answers
 * `belongs-to-another-account` after the code (the person has proved it), with the office's
 * address; nothing moves between accounts on its own.
 */

const NEXT_WIRING: SignInWiring = { settings: env, deps: nextSignInDeps }

const proven = (account: AccountSession, channel: SignInChannel) =>
  channel === 'email' ? account.verified.email : account.verified.mobile

export const requestDetailCodeWith =
  (wiring: SignInWiring): RequestDetailCode =>
  async (req, account, input, now) => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const parsed = detailRequestInput.safeParse(input)
    if (!parsed.success) return err({ code: 'invalid-identifier' })
    const { channel } = parsed.data
    const value = normaliseIdentifier(channel, parsed.data.identifier)
    if (!value) return err({ code: 'invalid-identifier' })
    // A detail of this kind is proven on the account already; changing it is not in this piece.
    if (proven(account, channel)) return err({ code: 'already-yours' })
    if (channel === 'whatsapp' && !(await whatsappCodesOpen(req, deps.env, now))) {
      return err({ code: 'whatsapp-closed', emailInstead: true })
    }
    return issueCode(
      req,
      deps,
      { purpose: 'addDetail', channel, value, accountId: account.accountId },
      now,
    )
  }

export const requestDetailCode = requestDetailCodeWith(NEXT_WIRING)

/**
 * Whether a WhatsApp code may go here and now (docs/20 §4.3, §4.6; D-126), for the pages that
 * offer one, such as the privacy page's "Add a mobile number": sign-in open here (production,
 * local or CI, with Better Auth's secret and `accountsEnabled` on), the WhatsApp channel set up,
 * Meta's authentication template approved in Messages → Templates, and outside quiet hours
 * (D-103, D-123). False on a preview, without reading anything.
 */
export async function whatsappCodesOpenHere(
  req?: PayloadRequest,
  now: Date = new Date(),
): Promise<boolean> {
  const settings = env()
  if (deploymentGate(settings) !== 'open') return false
  const request = req ?? (await createLocalReq({}, await getPayload({ config })))
  if (!(await signInOpen(request, settings))) return false
  return whatsappCodesOpen(request, settings, now)
}

/** Marks the detail proven on the account's own record. */
async function markProven(
  req: PayloadRequest,
  personId: number,
  channel: SignInChannel,
  value: string,
  now: Date,
): Promise<void> {
  const at = now.toISOString()
  await req.payload.update({
    collection: 'people',
    id: personId,
    data:
      channel === 'email'
        ? { email: value, emailVerifiedAt: at, emailVerifiedAt_tz: IST }
        : { mobile: value, mobileVerifiedAt: at, mobileVerifiedAt_tz: IST },
    // scope: the signed-in account's own record (account.personId), and only after its code proved the detail
    overrideAccess: true,
    depth: 0,
    req,
  })
}

/** Whether a record outside this account holds the detail proven (a closed account's). */
async function provenElsewhere(
  req: PayloadRequest,
  personId: number,
  channel: SignInChannel,
  value: string,
): Promise<boolean> {
  const { field, verifiedAt } = DETAIL_FIELDS[channel]
  const { totalDocs } = await req.payload.count({
    collection: 'people',
    where: {
      and: [
        { [field]: { equals: value } },
        { [verifiedAt]: { exists: true } },
        { id: { not_equals: personId } },
      ],
    },
    // scope: a count of other records holding this proven detail; nothing of them is read
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

export const confirmDetailWith =
  (wiring: SignInWiring): ConfirmDetail =>
  async (req, account, input, now) => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const attempt = await readAttempt(deps.jar, secretOf(deps), now, 'addDetail')
    if (!attempt || attempt.accountId !== account.accountId) {
      return err({ code: 'no-request' })
    }
    const target = {
      purpose: 'addDetail' as const,
      channel: attempt.channel,
      value: attempt.address,
    }
    const code = verifyCodeInput.shape.code.safeParse(input.code)
    if (!code.success) return triesLeft(deps, target)
    const checked = await checkCode(deps, target, code.data)
    if (!checked.ok) return checked
    clearAttempt(deps.jar, secureCookies(deps), 'addDetail')

    const holder = await accountVerifying(req, target.channel, target.value)
    if (
      (holder !== null && holder !== account.accountId) ||
      (holder === null &&
        (await provenElsewhere(req, account.personId, target.channel, target.value)))
    ) {
      return err({ code: 'belongs-to-another-account' })
    }
    const heldBefore = account.verified.email
    await markProven(req, account.personId, target.channel, target.value, now)
    await deps.auth.api.addDetail({
      body: { userId: account.authUserId, channel: target.channel, value: target.value },
    })
    await recordAudit(
      req,
      {
        action: 'add-contact-detail',
        entity: 'accounts',
        entityId: account.accountId,
        changed: [target.channel],
      },
      accountActor(account.accountId),
    )
    const { attached } = await attachEarlierRecords(req, {
      accountId: account.accountId,
      channel: target.channel,
      value: target.value,
    })
    // A3 to the email held before; a WhatsApp-only account had none (docs/20 §9).
    if (heldBefore && target.channel !== 'email') {
      const planned = await deps.deliver(req, {
        automation: 'A3',
        template: 'account-detail-added',
        channel: 'email',
        recipient: { kind: 'person', id: account.personId },
        subject: { collection: 'accounts', id: account.accountId },
        variant: target.channel,
        sendAt: now,
      })
      if (!planned.ok) {
        req.payload.logger.warn({ msg: `accounts: A3 not planned (${planned.error.code})` })
      }
    }
    return ok({ attached: attached.length })
  }

export const confirmDetail = confirmDetailWith(NEXT_WIRING)
