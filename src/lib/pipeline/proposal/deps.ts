import type { PayloadRequest } from 'payload'

import type { Flags } from '@/lib/settings/flags'

import type { EmitPipelineEvent } from '../events'
import type { LogActivity, MoveLead } from '../leads'
import type { ProposalMailer } from '../proposals'
import type { AddWorkingDays, CreateTask } from '../tasks'

import type { ProposalPrinter } from './print'

/**
 * What the proposal actions use besides the collections: the printer and the mailer (ports with
 * fakes), the CRM builder's operations (src/lib/pipeline/leads.ts, tasks.ts, events.ts, built in
 * src/lib/pipeline/core/ by builder A), the flags and the clock. `wiring.ts` gives the defaults;
 * the tests pass fakes. Nothing here holds a secret.
 */
export type ProposalDeps = {
  printer: ProposalPrinter
  /** The mailer for a request (the real one sends through the request's Payload instance). */
  mailerFor: (req: PayloadRequest) => ProposalMailer
  emit: EmitPipelineEvent
  logActivity: LogActivity
  createTask: CreateTask
  moveLead: MoveLead
  addWorkingDays: AddWorkingDays
  readFlags: (req: PayloadRequest) => Promise<Pick<Flags, 'pricesPublic'>>
  /** The origin the tracked link is built on (src/lib/env.ts `siteUrl`). */
  siteUrl: string
  now: () => Date
}
