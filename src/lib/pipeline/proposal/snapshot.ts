import { z } from 'zod'

import type { Proposal } from '@/payload-types'

import type { ProposalSnapshot } from '../proposals'
import { versionReference } from './reference'

/**
 * A version's frozen merge fields (docs/17 §5): what the kit's `print/proposal.html` prints, taken
 * from the working copy as staff typed it. The platform adds only the client's name (the lead's
 * organisation), the day and the reference; nothing else is filled in or defaulted (CLAUDE.md #1).
 * Pure.
 */

/** The working copy's parts that the template prints, in the template's order. */
export const PRINTED_PARTS = [
  'clientName',
  'title',
  'subtitle',
  'preparedByName',
  'preparedByTitle',
  'situation',
  'approach',
  'phases',
  'measures',
  'fees',
  'nextStep',
] as const

export type PrintedPart = (typeof PRINTED_PARTS)[number]

export type WorkingCopy = Pick<
  Proposal,
  | 'title'
  | 'subtitle'
  | 'preparedByName'
  | 'preparedByTitle'
  | 'situation'
  | 'approach'
  | 'phases'
  | 'measures'
  | 'fees'
  | 'nextStep'
>

const filled = (text: string | null | undefined) => typeof text === 'string' && text.trim() !== ''

/**
 * The printed parts still empty: `incomplete` names them, and no version is made. The fees are a
 * printed part only while they print (fees.ts): with prices hidden the section is left out, so a
 * version needs none typed.
 */
export function missingParts(
  copy: WorkingCopy,
  clientName: string | null,
  { feesMayPrint }: { feesMayPrint: boolean },
): PrintedPart[] {
  const present: Record<PrintedPart, boolean> = {
    clientName: filled(clientName),
    title: filled(copy.title),
    subtitle: filled(copy.subtitle),
    preparedByName: filled(copy.preparedByName),
    preparedByTitle: filled(copy.preparedByTitle),
    situation: filled(copy.situation),
    approach: filled(copy.approach),
    phases:
      (copy.phases?.length ?? 0) > 0 &&
      (copy.phases ?? []).every(
        (phase) =>
          filled(phase.name) &&
          filled(phase.what) &&
          filled(phase.duration) &&
          filled(phase.outcome),
      ),
    measures: filled(copy.measures),
    fees:
      !feesMayPrint ||
      ((copy.fees?.length ?? 0) > 0 &&
        (copy.fees ?? []).every(
          (fee) => filled(fee.item) && Number.isSafeInteger(fee.amountPaise) && fee.amountPaise > 0,
        )),
    nextStep: filled(copy.nextStep),
  }
  return PRINTED_PARTS.filter((part) => !present[part])
}

const text = (value: string | null | undefined) => (value ?? '').trim()

/**
 * The snapshot of a complete working copy. `reference` is the proposal's (IIIC-P-24117) and
 * `number` the version's; `date` is the day in India the version is made.
 */
export function snapshotOf(
  copy: WorkingCopy,
  meta: { clientName: string; date: string; reference: string; number: number },
): ProposalSnapshot {
  return snapshotWith(copy, {
    clientName: meta.clientName,
    date: meta.date,
    printedReference: versionReference(meta.reference, meta.number),
  })
}

/**
 * The working copy as it would print now, for the preview: empty parts stay empty and the
 * preview shows them as placeholders, for the office. The reference has no version number yet.
 */
export function draftSnapshotOf(
  copy: WorkingCopy,
  meta: { clientName: string | null; date: string; reference: string | null },
): ProposalSnapshot {
  return snapshotWith(copy, {
    clientName: meta.clientName ?? '',
    date: meta.date,
    printedReference: meta.reference ?? '',
  })
}

function snapshotWith(
  copy: WorkingCopy,
  meta: { clientName: string; date: string; printedReference: string },
): ProposalSnapshot {
  return {
    clientName: meta.clientName.trim(),
    title: text(copy.title),
    subtitle: text(copy.subtitle),
    date: meta.date,
    authorName: text(copy.preparedByName),
    authorTitle: text(copy.preparedByTitle),
    reference: meta.printedReference,
    situation: text(copy.situation),
    approach: text(copy.approach),
    phases: (copy.phases ?? []).map((phase) => ({
      name: text(phase.name),
      what: text(phase.what),
      duration: text(phase.duration),
      outcome: text(phase.outcome),
    })),
    measures: text(copy.measures),
    fees: (copy.fees ?? []).map((fee) => ({ item: text(fee.item), amountPaise: fee.amountPaise })),
    nextStep: text(copy.nextStep),
  }
}

const words = z.string().max(4000)

/** A stored snapshot, read back from a version's `document` (a JSON field: checked, not trusted). */
export const SNAPSHOT = z.object({
  clientName: words,
  title: words,
  subtitle: words,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorName: words,
  authorTitle: words,
  reference: z.string().max(40),
  situation: words,
  approach: words,
  phases: z.array(z.object({ name: words, what: words, duration: words, outcome: words })).max(12),
  measures: words,
  fees: z.array(z.object({ item: words, amountPaise: z.number().int().min(0) })).max(20),
  nextStep: words,
}) satisfies z.ZodType<ProposalSnapshot>

export function readSnapshot(document: unknown): ProposalSnapshot | null {
  const parsed = SNAPSHOT.safeParse(document)
  return parsed.success ? parsed.data : null
}
