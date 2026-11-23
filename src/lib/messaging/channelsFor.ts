import 'server-only'

import type { ServerEnv } from '@/lib/env'

import { AiSensyWhatsAppSender } from './aisensy'
import type { Channels } from './channels'
import {
  FakeEmailSender,
  FakeWhatsAppSender,
  NOT_CONFIGURED_EMAIL,
  NOT_CONFIGURED_WHATSAPP,
} from './fakes'
import { ResendEmailSender } from './resend'
import type { Channel } from './types'

/**
 * The senders this deployment uses (docs/19 §3), and whether each channel is set up:
 * - `MESSAGING_TRANSPORT=fake` (local and CI only; env.ts refuses it on Vercel): the in-memory
 *   fakes, one pair per process, so a test or a developer can read what was "sent";
 * - a Vercel deployment other than production (previews share production's database): neither
 *   channel, so nothing leaves from a preview;
 * - otherwise each channel whose keys are set: Resend with `RESEND_API_KEY`, AiSensy with the
 *   three WhatsApp settings (env.ts holds them together).
 * A channel that is not set up answers `not-configured`; the core then falls back or skips.
 */
export type ConfiguredChannels = Channels & { configured: Readonly<Record<Channel, boolean>> }

type Env = Pick<
  ServerEnv,
  'MESSAGING_TRANSPORT' | 'VERCEL_ENV' | 'RESEND_API_KEY' | 'WHATSAPP_API_KEY'
>

let fakes: { email: FakeEmailSender; whatsapp: FakeWhatsAppSender } | undefined

/** The process's fake senders (`MESSAGING_TRANSPORT=fake`), made on first use. */
export function fakeChannels(): { email: FakeEmailSender; whatsapp: FakeWhatsAppSender } {
  fakes ??= { email: new FakeEmailSender(), whatsapp: new FakeWhatsAppSender() }
  return fakes
}

const NONE: ConfiguredChannels = {
  email: NOT_CONFIGURED_EMAIL,
  whatsapp: NOT_CONFIGURED_WHATSAPP,
  configured: { email: false, whatsapp: false },
}

export function channelsFor(env: Env, fetcher: typeof fetch = fetch): ConfiguredChannels {
  if (env.MESSAGING_TRANSPORT === 'fake' && !env.VERCEL_ENV) {
    return { ...fakeChannels(), configured: { email: true, whatsapp: true } }
  }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return NONE
  const email = env.RESEND_API_KEY ? new ResendEmailSender(env.RESEND_API_KEY, fetcher) : null
  const whatsapp = env.WHATSAPP_API_KEY
    ? new AiSensyWhatsAppSender(env.WHATSAPP_API_KEY, fetcher)
    : null
  return {
    email: email ?? NOT_CONFIGURED_EMAIL,
    whatsapp: whatsapp ?? NOT_CONFIGURED_WHATSAPP,
    configured: { email: Boolean(email), whatsapp: Boolean(whatsapp) },
  }
}
