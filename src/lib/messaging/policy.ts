import type { ConsentState } from '@/lib/privacy/consentLedger'
import {
  DEFAULT_QUIET_HOURS,
  inQuietHours,
  minutesOf,
  type QuietHours,
} from '@/lib/settings/quietHours'
import { istMinutes } from '@/lib/time/ist'

import type { Channel, MessageKind, SkipReason } from './types'

/**
 * The send-time rules (docs/06, Engine rules; docs/13 §6, §7; docs/19 §3), decided in one pure
 * function so each rule has a test and every sender asks the same question. The core calls it
 * when a message is due, with what it has just read: the consent ledger, the suppression list,
 * the automation's switch, the channel's set-up, the quiet hours. Nothing here reads a database.
 */

export type SendContext = {
  now: Date
  channel: Channel
  kind: MessageKind
  /** For a promotional message: where the person stands on its purpose, from the ledger. */
  consent?: ConsentState
  /** The address on this channel (an email, or a mobile in E.164), or null when there is none. */
  hasAddress: boolean
  /** The address is on the suppression list for this channel (a bounce, a complaint, a STOP). */
  suppressed: boolean
  /** The person's age band (docs/08 §3): nothing promotional to anyone under 18. */
  under18: boolean
  /** The automation's switch (Admin → Messages → Automations). */
  automationEnabled: boolean
  /** The provider's settings exist and this deployment may send (docs/19 §3). */
  channelConfigured: boolean
  /** WhatsApp only: the provider template is approved (email templates need no approval). */
  templateApproved: boolean
  /**
   * WhatsApp only, for a message that may go only inside a conversation the person opened in
   * the last 24 hours (docs/06 V1): whether one is open now.
   */
  requiresOpenWindow?: boolean
  windowOpen?: boolean
  quietHours?: QuietHours
  /** The message is of no use from this moment (a reminder: its session's start). */
  sendBefore?: Date | null
  /** Where to go when this channel cannot carry it (docs/06: email is WhatsApp's fallback). */
  fallback?: Channel | null
}

export type SendDecision =
  | { action: 'send' }
  | { action: 'defer'; until: Date; reason: 'quiet-hours' }
  | { action: 'fallback'; channel: Channel; reason: SkipReason }
  | { action: 'skip'; reason: SkipReason }

/** Reasons that move a message to its fallback channel, when it has one. */
const FALLS_BACK: ReadonlySet<SkipReason> = new Set([
  'no-address',
  'suppressed',
  'not-configured',
  'template-not-approved',
  'window-closed',
])

function stop(context: SendContext, reason: SkipReason): SendDecision {
  const fallback = context.fallback
  if (fallback && fallback !== context.channel && FALLS_BACK.has(reason)) {
    return { action: 'fallback', channel: fallback, reason }
  }
  return { action: 'skip', reason }
}

/**
 * Whether to send now, later, on the other channel, or not at all. The order matters: a paused
 * automation sends nothing; consent and age come before any channel question, and a promotional
 * message never falls back to a channel the person did not consent to (each channel has its own
 * purpose); quiet hours apply to WhatsApp only (docs/06), and a message they would delay past its
 * use is dropped, not moved to email (docs/06 B6).
 */
export function decideSend(context: SendContext): SendDecision {
  if (!context.automationEnabled) return { action: 'skip', reason: 'paused' }
  if (context.kind === 'promotional') {
    if (context.under18) return { action: 'skip', reason: 'under-18' }
    if (context.consent !== 'granted') return { action: 'skip', reason: 'no-consent' }
  }
  if (context.sendBefore && context.now.getTime() >= context.sendBefore.getTime()) {
    return { action: 'skip', reason: 'too-late' }
  }
  const promotional = context.kind === 'promotional'
  const refuse = (reason: SkipReason): SendDecision =>
    promotional ? { action: 'skip', reason } : stop(context, reason)
  if (!context.hasAddress) return refuse('no-address')
  if (context.suppressed) return refuse('suppressed')
  if (!context.channelConfigured) return refuse('not-configured')
  if (context.channel === 'whatsapp') {
    if (!context.templateApproved) return refuse('template-not-approved')
    if (context.requiresOpenWindow && !context.windowOpen) return refuse('window-closed')
    const quiet = context.quietHours ?? DEFAULT_QUIET_HOURS
    if (inQuietHours(context.now, quiet)) {
      const until = quietHoursEnd(context.now, quiet)
      if (context.sendBefore && until.getTime() >= context.sendBefore.getTime()) {
        return { action: 'skip', reason: 'quiet-hours-late' }
      }
      return { action: 'defer', until, reason: 'quiet-hours' }
    }
  }
  return { action: 'send' }
}

const MINUTE = 60_000
const DAY_MINUTES = 24 * 60

/**
 * The next moment the quiet hours end, read in India (08:00 by default): the time a WhatsApp
 * message due in the window is sent (docs/06). India keeps no daylight saving, so counting
 * minutes from the moment's own minute in IST is exact.
 */
export function quietHoursEnd(instant: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): Date {
  const end = minutesOf(quiet.end) ?? (minutesOf(DEFAULT_QUIET_HOURS.end) as number)
  const minuteStart = Math.floor(instant.getTime() / MINUTE) * MINUTE
  const delta = (end - istMinutes(instant) + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES
  return new Date(minuteStart + delta * MINUTE)
}

/**
 * The time a message planned for `at` will actually go on this channel: `at` itself, or the end
 * of the quiet hours for WhatsApp; null when that is too late for `sendBefore` (the reminder is
 * dropped, docs/06 B6). Used when a message is planned, and asked again when it is due.
 */
export function plannedSendTime(
  at: Date,
  channel: Channel,
  quiet: QuietHours = DEFAULT_QUIET_HOURS,
  sendBefore?: Date | null,
): Date | null {
  const when = channel === 'whatsapp' && inQuietHours(at, quiet) ? quietHoursEnd(at, quiet) : at
  if (sendBefore && when.getTime() >= sendBefore.getTime()) return null
  return when
}

/**
 * When a planned message is queued for, or why it never can go (its use has already passed).
 * Quiet hours move a WhatsApp message to their end when that is still in time; when it is not,
 * the message is queued for its own time all the same and the quiet hours as they stand when it
 * is due decide (`decideSend`): a reminder is dropped as `quiet-hours-late` at send time, never at
 * planning, so the settings in force when it would go are the ones that count.
 */
export function queueTiming(
  planned: { sendAt: Date; sendBefore?: Date | null; channel: Channel },
  quiet: QuietHours | undefined,
): { sendAt: Date; skip?: SkipReason } {
  const sendBefore = planned.sendBefore ?? null
  if (sendBefore && planned.sendAt.getTime() >= sendBefore.getTime()) {
    return { sendAt: planned.sendAt, skip: 'too-late' }
  }
  const when = plannedSendTime(planned.sendAt, planned.channel, quiet, sendBefore)
  return { sendAt: when ?? planned.sendAt }
}
