import 'server-only'

import { implementationOf } from '@/emails'
import type { TemplateKey } from '@/emails/registry'
import type { TemplateImplementation } from '@/emails/types'
import { emitAutomationEvent, type EmitAutomationEvent } from '@/lib/automations/emit'
import { env } from '@/lib/env'

import { channelsFor, type ConfiguredChannels } from './channelsFor'

/**
 * What the messaging core takes from outside (docs/19 §3), passed in so the tests run it on the
 * fakes with a fixed clock: the senders, the time, the templates, the event emitter and the site.
 */
export type SiteFacts = {
  siteUrl: string
  /** The root mail domain (D-05); without it everything goes from `fromAddress`. */
  mailDomain?: string
  fromAddress: string
  /** Production refuses to send a client a message with a `[[TODO: …]]` in it (docs/19 §7). */
  blockPlaceholders: boolean
}

export type MessagingDeps = {
  channels: () => ConfiguredChannels
  now: () => Date
  implementation: (key: TemplateKey) => TemplateImplementation<never> | undefined
  emit: EmitAutomationEvent
  site: () => SiteFacts
}

export function defaultMessagingDeps(): MessagingDeps {
  return {
    channels: () => channelsFor(env()),
    now: () => new Date(),
    implementation: implementationOf,
    emit: emitAutomationEvent,
    site: () => {
      const settings = env()
      return {
        siteUrl: settings.siteUrl,
        mailDomain: settings.MAIL_DOMAIN,
        fromAddress: settings.EMAIL_FROM_ADDRESS,
        blockPlaceholders: settings.VERCEL_ENV === 'production',
      }
    },
  }
}
