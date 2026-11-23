import 'server-only'

import type { PayloadRequest } from 'payload'

import { env } from '@/lib/env'
import { readFlags } from '@/lib/settings/source'

import type { ProposalDeps } from './deps'
import {
  interimAddWorkingDays,
  interimCreateTask,
  interimEmit,
  interimLogActivity,
  interimMoveLead,
} from './interim'
import { payloadProposalMailer } from './mailer'
import { fakeProposalPrinter } from './print'
import { makeProposals, type Proposals } from './service'

/**
 * The app's proposal actions, joined to this deployment's printer, mailer and the CRM's
 * operations (docs/17 §12).
 *
 * At the merge (the lead):
 * - the CRM's operations: `emit`, `logActivity`, `createTask`, `moveLead` and `addWorkingDays`
 *   from builder A's src/lib/pipeline/core/ in place of ./interim (then delete interim.ts);
 * - the printer: M3's documents slice (src/lib/pdf/documents.ts) in place of the stand-in,
 *   `page` from `proposalPage(snapshot, { pricesPublic: feesMayPrint })` and `pdf` from
 *   `renderProposalPdf(snapshot, { pricesPublic: feesMayPrint })` (a ProposalSnapshot is field
 *   for field its ProposalDocument), its `prices-hidden` read as `fees-hidden` and `no-fees` as
 *   `incomplete` with ['fees']; and, once the private bucket's DocumentStore is wired, the copy
 *   sent stored and served from there.
 *
 * Until then the stand-in printer prints a PDF only where no Vercel deployment runs it (local
 * and CI), as the fake payment gateway does, so no client can receive its copy.
 */

let instance: Proposals | undefined

export function proposalDeps(): ProposalDeps {
  const config = env()
  return {
    printer: fakeProposalPrinter({ printsPdf: !config.VERCEL_ENV }),
    mailerFor: (req) => payloadProposalMailer(req.payload),
    emit: interimEmit,
    logActivity: interimLogActivity,
    createTask: interimCreateTask,
    moveLead: interimMoveLead,
    addWorkingDays: interimAddWorkingDays,
    readFlags: (req: PayloadRequest) => readFlags(req.payload),
    siteUrl: config.siteUrl,
    now: () => new Date(),
  }
}

export function proposals(): Proposals {
  instance ??= makeProposals(proposalDeps())
  return instance
}
