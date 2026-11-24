import 'server-only'

import type { z } from 'zod'

import { PartnershipEnquiryInput, TeamMapRequestInput, UtmInput } from '@/lib/pipeline/forms'
import type { EnquiryContext, PipelineError, ReceivedEnquiry } from '@/lib/pipeline/leads'
import type { EnquiryOutcome } from '@/lib/pipeline/values'
import type { Result } from '@/lib/result'

import { checkDrawn, submitterHashesWithin } from './guards'
import { LIMITS, type RecentEnquiries } from './limits'
import { PAGE_PATH } from './register'
import { type EnquiryFormState, HIDDEN, type NoticeShown, UTM_KEYS } from './state'
import { type EnquiryFormKind, FORM_COPY, type Refusal } from './strings'
import { isTokenShaped, type TurnstileCheck } from './turnstile'

/**
 * What happens when a public form is sent (docs/17 §6), as a function of the submission and the
 * world it runs in, so the tests can give it fakes for everything outside it. In order:
 *
 * 1. the trap field and the signed time the form was drawn: a robot's submission gets the
 *    acknowledgement and nothing is stored, so it learns nothing;
 * 2. the consent text in force: none, and the form is refused; another than the one the form
 *    showed, and the form asks again with the new text, the box unticked;
 * 3. the fields, through the boundary's schemas (src/lib/pipeline/forms.ts): any error goes back
 *    to the form with what was typed;
 * 4. the deployment: a preview, which shares production's database, stores nothing and says so
 *    (src/lib/enquiryForms/deployment.ts);
 * 5. Turnstile, where its keys are set; then the rate limits;
 * 6. `ReceiveEnquiry` (docs/17 §4), which stores everything or nothing; then the
 *    `request_submitted` event, with the page and its register only.
 *
 * Nothing here logs a field, an address or a hash: a fault is reported by its name alone.
 */

export type SubmitWorld = {
  now: Date
  /** The server's secret, and the one it replaced while it is being rotated. */
  secrets: readonly string[]
  /** The network address, as the platform's proxy passes it; for the hash and the consent's evidence. */
  address: string | null
  userAgent: string | null
  /** The page the submission came from, as the browser says, for its campaign tags. */
  referer: string | null
  /** Whether an origin is this site's own, so that only its own pages' addresses are read. */
  ownOrigin: (origin: string) => boolean
  /** Whether this deployment may store a request: never a preview (./deployment.ts). */
  storesHere: boolean
  /** The check, where Turnstile's keys are set; null where they are not. */
  turnstile: TurnstileCheck | null
  recent: RecentEnquiries
  noticeInForce: () => Promise<NoticeShown | null>
  receive: (
    input: ReceivedEnquiry,
  ) => Promise<
    Result<{ enquiryId: number; leadId: number; outcome: EnquiryOutcome }, PipelineError>
  >
  /** Records `request_submitted` after the response; never fails the request. */
  recordSubmitted: (page: string) => void
  reportFault: (error: unknown) => void
}

const SCHEMAS = { teamMap: TeamMapRequestInput, partnership: PartnershipEnquiryInput } as const

/** A form's value as text: a file or a missing field is no answer. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name)
  return typeof value === 'string' ? value : undefined
}

/** What the person typed into the form's own fields, to draw again. */
function typedValues(kind: EnquiryFormKind, form: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of FORM_COPY[kind].fields) {
    const value = text(form, field.name)
    if (value !== undefined) values[field.name] = value.slice(0, field.maxLength)
  }
  if (text(form, 'consent') === 'yes') values.consent = 'yes'
  return values
}

/** The campaign tags: kept from an earlier answer, else read from the page's own address. */
function campaignTags(form: FormData, referer: string | null, own: SubmitWorld['ownOrigin']) {
  const raw: Record<string, string | undefined> = {}
  for (const key of UTM_KEYS) raw[key] = text(form, `utm_${key}`)
  if (UTM_KEYS.every((key) => !raw[key]) && referer) {
    try {
      const from = new URL(referer)
      if (own(from.origin)) {
        for (const key of UTM_KEYS) raw[key] = from.searchParams.get(`utm_${key}`) ?? undefined
      }
    } catch {
      // A referer that is not an address carries no tags.
    }
  }
  const parsed = UtmInput.safeParse(raw)
  const utm: Record<string, string> = {}
  if (parsed.success) {
    for (const key of UTM_KEYS) {
      const value = parsed.data[key]
      if (value) utm[key] = value
    }
  }
  return utm
}

/** The page the form was on: its own hidden field, else the referer's path, else the home page. */
function pageOf(form: FormData, referer: string | null, own: SubmitWorld['ownOrigin']): string {
  const given = text(form, HIDDEN.page)
  if (given && PAGE_PATH.test(given)) return given
  try {
    const from = referer ? new URL(referer) : null
    if (from && own(from.origin) && PAGE_PATH.test(from.pathname)) return from.pathname
  } catch {
    // Not an address.
  }
  return '/'
}

/** The first message for each field the schema refused, by field name. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const name = issue.path[0]
    if (typeof name === 'string' && !(name in errors)) errors[name] = issue.message
  }
  return errors
}

export async function submitEnquiry(
  kind: EnquiryFormKind,
  previous: EnquiryFormState,
  form: FormData,
  world: SubmitWorld,
): Promise<EnquiryFormState> {
  // The previous state comes from the browser: only its count is read, and only if it is one.
  const counted = (previous as Partial<EnquiryFormState> | null)?.attempt
  const attempt = (Number.isSafeInteger(counted) ? (counted as number) : 0) + 1
  const values = typedValues(kind, form)
  const utm = campaignTags(form, world.referer, world.ownOrigin)
  const page = pageOf(form, world.referer, world.ownOrigin)
  const answer = (status: EnquiryFormState['status'], extra: Partial<EnquiryFormState> = {}) => ({
    status,
    errors: {},
    values,
    utm,
    attempt,
    ...extra,
  })
  const refuse = (refusal: Refusal, extra: Partial<EnquiryFormState> = {}) =>
    answer('refused', { refusal, ...extra })
  // What the acknowledgement needs and nothing more: what was typed is not sent back.
  const received = (): EnquiryFormState => ({ ...answer('received'), values: {}, utm: {} })

  try {
    // 1. A robot gets the acknowledgement, and nothing is stored.
    const trap = text(form, HIDDEN.trap)
    if (trap !== undefined && trap !== '') return received()
    if (checkDrawn(text(form, HIDDEN.drawn), kind, world.now, world.secrets) !== 'ok') {
      return received()
    }

    // 2. The consent text: the form is sent only under the one in force.
    const notice = await world.noticeInForce()
    if (!notice) return refuse('no-notice')
    const shown = Number(text(form, HIDDEN.noticeVersion))
    const { consent: _ticked, ...unticked } = values
    if (shown !== notice.version) return refuse('notice-changed', { notice, values: unticked })

    // 3. The fields.
    const parsed = SCHEMAS[kind].safeParse({
      ...values,
      consent: values.consent,
      noticeVersion: text(form, HIDDEN.noticeVersion),
    })
    if (!parsed.success) return answer('invalid', { errors: fieldErrors(parsed.error) })

    // 4. Nothing from a preview reaches production's database, nor Turnstile.
    if (!world.storesHere) return refuse('preview')

    // 5. Turnstile, where it is on; then the rate limits.
    let turnstile: EnquiryContext['turnstile'] = 'off'
    if (world.turnstile) {
      const token = text(form, HIDDEN.turnstile)
      if (!isTokenShaped(token) || !(await world.turnstile(token, world.address))) {
        return refuse('turnstile')
      }
      turnstile = 'passed'
    }
    const secret = world.secrets[0] as string
    const hashes = submitterHashesWithin(
      secret,
      world.address ?? '',
      world.now,
      LIMITS.perAddress.windowMs,
    )
    const since = (windowMs: number) => new Date(world.now.getTime() - windowMs)
    if (
      (await world.recent.fromSubmitter(hashes, since(LIMITS.perAddress.windowMs))) >=
        LIMITS.perAddress.count ||
      (await world.recent.fromEmail(parsed.data.email, since(LIMITS.perEmail.windowMs))) >=
        LIMITS.perEmail.count
    ) {
      return refuse('limit')
    }

    // 6. Stored, all or nothing.
    const context: EnquiryContext = {
      page,
      utm,
      evidence: { ip: world.address, userAgent: world.userAgent, form: FORM_COPY[kind].anchor },
      submitterHash: hashes[0] as string,
      turnstile,
      receivedAt: world.now,
    }
    // The schema was picked by the kind, so the fields are that kind's.
    const result = await world.receive({ kind, fields: parsed.data, context } as ReceivedEnquiry)
    if (!result.ok) {
      if (result.error.code === 'no-notice') return refuse('no-notice')
      if (result.error.code === 'notice-changed') {
        const now = await world.noticeInForce()
        return now
          ? refuse('notice-changed', { notice: now, values: unticked })
          : refuse('no-notice')
      }
      return refuse('failed')
    }
    world.recordSubmitted(page)
    return received()
  } catch (error) {
    world.reportFault(error)
    return refuse('failed')
  }
}
