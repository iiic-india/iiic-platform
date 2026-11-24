import 'server-only'

import type { PayloadRequest } from 'payload'

import type { FrameFooter } from '@/emails/components/Frame'
import { priceAllowed, templateSpec, type TemplateKey } from '@/emails/registry'
import { renderEmail } from '@/emails/render'
import type { EmailContext, TemplateImplementation } from '@/emails/types'
import type { AutomationId } from '@/lib/automations/catalogue'
import { automationEnabled, countOutcome } from '@/lib/automations/rows'
import { consentFor } from '@/lib/privacy/consents'
import type { Result } from '@/lib/result'
import { LEGAL_PLACEHOLDERS, typed } from '@/lib/settings/legal'
import { readFlags, readLegalInformation, readQuietHours } from '@/lib/settings/source'
import type { Message } from '@/payload-types'

import type { SendError, Sent } from './channels'
import type { MessagingDeps } from './deps'
import { hasPlaceholder, showsPrice, storedProviderId } from './guards'
import { LINK_DAYS, linkUrls, signLink } from './links'
import { messageKey } from './operations'
import { messageById, recordRow } from './outbox'
import { decideSend, type SendContext } from './policy'
import { NO_RECIPIENT, recipientFacts, windowOpen, type RecipientFacts } from './recipients'
import { senderFor } from './senders'
import { nextAttemptAt } from './states'
import { claim, move } from './store'
import { isSuppressed } from './suppress'
import type { Channel, Recipient, SkipReason, Subject } from './types'

/**
 * One try at one message (docs/19 §3): claim it (queued → sending, committed before the provider
 * is called), read everything as it is now (the address, the suppression list, the ledger, the
 * age band, the automation's switch, the channel's set-up, the WhatsApp template's approval, the
 * 24-hour window, the quiet hours), ask `decideSend`, then send, defer, fall back or skip, and
 * record the outcome by conditional update. A provider's refusal is retried after 1 minute, 10
 * minutes and 1 hour, then the message fails visibly (`message.failed`). Logs hold codes only.
 */
export type TryOutcome =
  'sent' | 'deferred' | 'skipped' | 'failed' | 'retried' | 'unknown' | 'not-claimed'

const PURPOSE_OF: Readonly<Record<Channel, 'marketingEmail' | 'marketingWhatsapp'>> = {
  email: 'marketingEmail',
  whatsapp: 'marketingWhatsapp',
}

function recipientOf(message: Message): Recipient | null {
  const id = (value: unknown) =>
    typeof value === 'number'
      ? value
      : value && typeof value === 'object' && 'id' in value
        ? Number((value as { id: unknown }).id)
        : null
  const target =
    message.recipientKind === 'person'
      ? id(message.person)
      : message.recipientKind === 'subscriber'
        ? id(message.subscriber)
        : id(message.staff)
  return target === null || Number.isNaN(target)
    ? null
    : { kind: message.recipientKind, id: target }
}

const dateOf = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

type WhatsAppTemplateEntry = { name: string; language: string }

/** The approved provider template for a key, in the person's language if there is one. */
async function approvedWhatsApp(
  req: PayloadRequest,
  key: TemplateKey,
  language: string,
): Promise<WhatsAppTemplateEntry | null> {
  const { docs } = await req.payload.find({
    collection: 'message-templates',
    where: {
      and: [
        { key: { equals: key } },
        { channel: { equals: 'whatsapp' } },
        { status: { equals: 'approved' } },
      ],
    },
    limit: 10,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const usable = docs.filter((doc) => typeof doc.providerTemplateName === 'string')
  const chosen = usable.find((doc) => doc.language === language) ?? usable[0]
  return chosen
    ? { name: String(chosen.providerTemplateName), language: String(chosen.language) }
    : null
}

async function footerFor(
  req: PayloadRequest,
  key: TemplateKey,
  facts: RecipientFacts,
  siteUrl: string,
): Promise<{ footer: FrameFooter; headers?: Record<string, string> }> {
  const legal = await readLegalInformation(req.payload)
  const legalLine = [
    legal.legalName ?? typed(LEGAL_PLACEHOLDERS.legalName),
    legal.address ?? typed(LEGAL_PLACEHOLDERS.address),
  ].join(' · ')
  const base: FrameFooter = {
    legalLine,
    siteUrl,
    siteDisplay: siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
  }
  const spec = templateSpec(key)
  if (spec.footer === 'unsubscribe' && facts.subscriberId !== null) {
    const token = await signLink({
      purpose: 'unsubscribe',
      subjectId: facts.subscriberId,
      expiresInDays: LINK_DAYS.unsubscribe,
    })
    const urls = linkUrls(siteUrl, token)
    return {
      footer: { ...base, preferences: { href: urls.unsubscribe, label: 'Unsubscribe' } },
      // RFC 8058: one click unsubscribes, without a page in between.
      headers: {
        'List-Unsubscribe': `<${urls.oneClick}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  }
  if (spec.footer !== 'none' && facts.personId !== null) {
    const token = await signLink({
      purpose: 'withdraw',
      subjectId: facts.personId,
      expiresInDays: LINK_DAYS.withdraw,
    })
    return {
      footer: {
        ...base,
        preferences: { href: linkUrls(siteUrl, token).withdraw, label: 'Email preferences' },
      },
    }
  }
  return { footer: base }
}

type Rendered =
  | { kind: 'email'; subject: string; html: string; text: string; headers?: Record<string, string> }
  | { kind: 'whatsapp'; params: string[]; template: WhatsAppTemplateEntry }

type RenderFailure = { skip: SkipReason } | { fail: string }

async function render(
  req: PayloadRequest,
  deps: MessagingDeps,
  message: Message,
  recipient: Recipient,
  facts: RecipientFacts,
  whatsapp: WhatsAppTemplateEntry | null,
  transient: Readonly<Record<string, string>> | undefined,
): Promise<Rendered | RenderFailure> {
  const key = message.template as TemplateKey
  const impl = deps.implementation(key) as TemplateImplementation<unknown> | undefined
  if (!impl) return { fail: 'template-missing' }
  const subject: Subject = { collection: message.subjectCollection, id: message.subjectId }
  const loaded = await impl.load(req, {
    subject,
    recipient,
    sendBefore: dateOf(message.sendBefore),
    variant: message.variant ?? null,
    ...(transient ? { transient } : {}),
  })
  if (!loaded.ok) return { skip: 'stale' }
  const site = deps.site()
  const flags = await readFlags(req.payload)
  const pricesOk = priceAllowed(key, flags)
  const internal = message.kind === 'internal'
  if (message.channel === 'whatsapp') {
    if (!impl.whatsapp || !whatsapp) return { fail: 'template-missing' }
    const data = impl.whatsapp.schema.safeParse(loaded.value)
    if (!data.success) return { fail: 'invalid-data' }
    const params = impl.whatsapp.params(data.data)
    if (!pricesOk && showsPrice(...params)) return { skip: 'price-hidden' }
    if (site.blockPlaceholders && !internal && hasPlaceholder(...params)) {
      return { fail: 'placeholder' }
    }
    return { kind: 'whatsapp', params, template: whatsapp }
  }
  if (!impl.email) return { fail: 'template-missing' }
  const data = impl.email.schema.safeParse(loaded.value)
  if (!data.success) return { fail: 'invalid-data' }
  const { footer, headers } = await footerFor(req, key, facts, site.siteUrl)
  const context: EmailContext = {
    siteUrl: site.siteUrl,
    assetUrl: `${site.siteUrl.replace(/\/+$/, '')}/email`,
    footer,
    priceAllowed: pricesOk,
  }
  const rendered = await renderEmail(impl.email, data.data, context)
  if (!pricesOk && showsPrice(rendered.subject, rendered.preheader, rendered.text)) {
    return { skip: 'price-hidden' }
  }
  if (
    site.blockPlaceholders &&
    !internal &&
    hasPlaceholder(rendered.subject, rendered.text, rendered.html)
  ) {
    return { fail: 'placeholder' }
  }
  return {
    kind: 'email',
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(headers ? { headers } : {}),
  }
}

async function fail(
  req: PayloadRequest,
  deps: MessagingDeps,
  message: Message,
  code: string,
  now: Date,
): Promise<TryOutcome> {
  const moved = await move(req, message.id, ['sending'], 'failed', { lastError: code }, now)
  if (moved) {
    await countOutcome(req, message.automation as AutomationId, 'failure', now)
    await deps.emit(req, { name: 'message.failed', messageId: message.id })
  }
  return 'failed'
}

async function recordAnswer(
  req: PayloadRequest,
  deps: MessagingDeps,
  message: Message,
  attempts: number,
  provider: 'resend' | 'aisensy' | 'fake',
  answer: Result<Sent, SendError>,
  now: Date,
): Promise<TryOutcome> {
  if (answer.ok) {
    await move(
      req,
      message.id,
      ['sending'],
      'sent',
      {
        sentAt: now,
        provider,
        providerMessageId: storedProviderId(provider, answer.value.providerMessageId, message.id),
        lastError: null,
      },
      now,
    )
    await countOutcome(req, message.automation as AutomationId, 'success', now)
    return 'sent'
  }
  const { code, retryable } = answer.error
  // A WhatsApp call that never answered may have been delivered: never resent (at most once).
  if (message.channel === 'whatsapp' && code === 'unavailable' && !retryable) {
    const moved = await move(req, message.id, ['sending'], 'unknown', { lastError: code }, now)
    if (moved) await deps.emit(req, { name: 'message.failed', messageId: message.id })
    return 'unknown'
  }
  const next = retryable ? nextAttemptAt(attempts, now) : null
  if (next) {
    await move(req, message.id, ['sending'], 'queued', { sendAt: next, lastError: code }, now)
    return 'retried'
  }
  return fail(req, deps, message, code, now)
}

async function fallBack(
  req: PayloadRequest,
  deps: MessagingDeps,
  message: Message,
  channel: Channel,
  reason: SkipReason,
  now: Date,
): Promise<TryOutcome> {
  const subject: Subject = { collection: message.subjectCollection, id: message.subjectId }
  const { message: fallback } = await recordRow(req, {
    dedupeKey: messageKey({
      automation: message.automation as AutomationId,
      subject,
      variant: message.variant ?? undefined,
      channel,
    }),
    automation: message.automation,
    template: message.template,
    variant: message.variant ?? null,
    channel,
    fallback: null,
    kind: message.kind,
    sender: message.sender ?? templateSpec(message.template as TemplateKey).sender,
    status: 'queued',
    recipientKind: message.recipientKind,
    person: message.person ?? null,
    subscriber: message.subscriber ?? null,
    staff: message.staff ?? null,
    subjectCollection: message.subjectCollection,
    subjectId: message.subjectId,
    counselling: message.counselling ?? false,
    fallbackOf: message.id,
    sendAt: now.toISOString(),
    sendBefore: message.sendBefore ?? null,
    requiresOpenWindow: false,
    attempts: 0,
  } as Parameters<typeof recordRow>[1])
  await move(req, message.id, ['sending'], 'skipped', { skipReason: reason }, now)
  // The email goes now, in this same run (no transaction is open here: it has committed).
  if (fallback.status === 'queued') {
    const outcome = await tryMessage(req, deps, fallback.id)
    return outcome === 'not-claimed' ? 'skipped' : outcome
  }
  return 'skipped'
}

/**
 * Tries one message now. Safe to call twice at once: only one claim succeeds. `transient` is the
 * caller's data for this first try only (src/emails/types.ts); the dispatcher never has it.
 */
export async function tryMessage(
  req: PayloadRequest,
  deps: MessagingDeps,
  id: number,
  transient?: Readonly<Record<string, string>>,
): Promise<TryOutcome> {
  const now = deps.now()
  const claimed = await claim(req, id, now)
  if (!claimed) return 'not-claimed'
  let providerCalled = false
  try {
    const message = await messageById(req, id)
    if (!message) return 'not-claimed'
    const recipient = recipientOf(message)
    const facts = recipient ? await recipientFacts(req, recipient, message.channel) : NO_RECIPIENT
    const key = message.template as TemplateKey
    const channels = deps.channels()
    const promotional = message.kind === 'promotional'
    const whatsapp =
      message.channel === 'whatsapp' ? await approvedWhatsApp(req, key, facts.language) : null
    const implementation = deps.implementation(key)
    const context: SendContext = {
      now,
      channel: message.channel,
      kind: message.kind,
      consent:
        promotional && facts.personId !== null
          ? await consentFor(req.payload, facts.personId, PURPOSE_OF[message.channel], req)
          : promotional
            ? 'none'
            : undefined,
      hasAddress: facts.address !== null && recipient !== null,
      suppressed: facts.address ? await isSuppressed(req, message.channel, facts.address) : false,
      under18: facts.under18,
      automationEnabled: await automationEnabled(req, message.automation as AutomationId),
      channelConfigured: channels.configured[message.channel],
      templateApproved:
        message.channel !== 'whatsapp' || (whatsapp !== null && Boolean(implementation?.whatsapp)),
      requiresOpenWindow: Boolean(message.requiresOpenWindow),
      windowOpen: windowOpen(facts.lastInboundAt, now),
      quietHours: message.channel === 'whatsapp' ? await readQuietHours(req.payload) : undefined,
      sendBefore: dateOf(message.sendBefore),
      fallback: message.fallback ?? null,
    }
    const decision = decideSend(context)
    if (decision.action === 'skip') {
      await move(req, id, ['sending'], 'skipped', { skipReason: decision.reason }, now)
      return 'skipped'
    }
    if (decision.action === 'defer') {
      await move(req, id, ['sending'], 'queued', { sendAt: decision.until, uncountTry: true }, now)
      return 'deferred'
    }
    if (decision.action === 'fallback') {
      return fallBack(req, deps, message, decision.channel, decision.reason, now)
    }
    const rendered = await render(
      req,
      deps,
      message,
      recipient as Recipient,
      facts,
      whatsapp,
      transient,
    )
    if ('skip' in rendered) {
      await move(req, id, ['sending'], 'skipped', { skipReason: rendered.skip }, now)
      return 'skipped'
    }
    if ('fail' in rendered) return fail(req, deps, message, rendered.fail, now)
    const address = facts.address as string
    if (rendered.kind === 'email') {
      const site = deps.site()
      const sender = senderFor(
        message.sender ?? templateSpec(key).sender,
        site.mailDomain,
        site.fromAddress,
      )
      providerCalled = true
      const answer = await channels.email.send({
        from: sender.from,
        to: address,
        ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        ...(rendered.headers ? { headers: rendered.headers } : {}),
        idempotencyKey: message.dedupeKey,
        tags: [
          { name: 'automation', value: message.automation },
          { name: 'template', value: message.template },
        ],
      })
      return recordAnswer(
        req,
        deps,
        message,
        claimed.attempts,
        channels.email.provider,
        answer,
        now,
      )
    }
    providerCalled = true
    const answer = await channels.whatsapp.sendTemplate({
      to: address,
      templateName: rendered.template.name,
      language: rendered.template.language,
      params: rendered.params,
      idempotencyKey: message.dedupeKey,
    })
    return recordAnswer(
      req,
      deps,
      message,
      claimed.attempts,
      channels.whatsapp.provider,
      answer,
      now,
    )
  } catch {
    // A fault before the provider was called: back in the queue, or failed once the tries are
    // spent. After the call, the row is left `sending` for the sweep (dispatch.ts), which never
    // sends a WhatsApp message twice. The fault itself is not logged: it may quote the data.
    if (!providerCalled) {
      const next = nextAttemptAt(claimed.attempts, now)
      if (next) {
        await move(req, id, ['sending'], 'queued', { sendAt: next, lastError: 'fault' }, now)
        return 'retried'
      }
      const message = await messageById(req, id)
      if (message) return fail(req, deps, message, 'fault', now)
    }
    req.payload.logger.error({ msg: 'messages: a try failed', messageId: id })
    return 'failed'
  }
}
