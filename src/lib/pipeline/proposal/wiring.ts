import type { PayloadRequest } from 'payload'

import { coreProposalMailer } from '@/lib/automations/pipeline/proposalMailer'
import { env } from '@/lib/env'
import { readFlags } from '@/lib/settings/source'

import type { ProposalDeps } from './deps'
import { kitProposalPrinter } from './kitPrinter'
import { makeProposals, type Proposals } from './service'
import { logPlatformActivity } from '../core/activities'
import { emitPipelineEvent } from '../core/emit'
import { moveLead } from '../core/moves'
import { createTask } from '../core/tasks'
import { addWorkingDays } from '../core/workingDays'

/**
 * The app's proposal actions, joined to this deployment's printer, mailer and the CRM core's
 * operations (docs/17 §12): M3's renderer through the kit's template (the serverless Chromium on
 * Vercel), M6's messaging core for the email, and src/lib/pipeline/core/. A proposal's timeline entries are
 * the platform's (type `proposal`), recorded as the owner's or operator's whose action they
 * record; the platform's own moves of the lead pass `by: null`. The tests pass their own
 * dependencies, the fake printer and mailer among them.
 *
 * The collections' endpoints reach this module, so it is not marked `server-only`: the Payload
 * CLI loads the config outside Next.js (src/lib/env.ts says why). It reads no secret itself, and
 * the printer loads the renderer only when it prints.
 */

let instance: Proposals | undefined

export function proposalDeps(): ProposalDeps {
  const config = env()
  return {
    printer: kitProposalPrinter({ serverless: Boolean(config.VERCEL_ENV) }),
    // M6's core and the React Email template (P5), logged in `messages` (docs/19 §5).
    mailerFor: (req) => coreProposalMailer(req),
    emit: emitPipelineEvent,
    logActivity: logPlatformActivity,
    createTask,
    moveLead,
    addWorkingDays,
    readFlags: (req: PayloadRequest) => readFlags(req.payload),
    siteUrl: config.siteUrl,
    now: () => new Date(),
  }
}

export function proposals(): Proposals {
  instance ??= makeProposals(proposalDeps())
  return instance
}
