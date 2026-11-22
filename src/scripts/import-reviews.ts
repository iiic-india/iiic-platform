import { getPayload } from 'payload'
import { readSheet } from 'read-excel-file/node'

import { importIntake } from '../lib/proof/importIntake'
import { INTAKE_SHEET, parseIntakeRows } from '../lib/proof/intake'
import config from '../payload.config'

/**
 * The one-off import of the reviews intake sheet (I-42; docs/05, Proof). An owner, or the
 * developer at an owner's request, runs it once IIIC has filled the sheet and recorded each
 * reply's evidence:
 *
 *   pnpm reviews:import path/to/reviews-intake.xlsx
 *
 * with the environment of the database it writes to. It reads the Reviews sheet with
 * read-excel-file, records each row whole or not at all (src/lib/proof/importIntake.ts), and is
 * safe to run again after fixing the rows it refused. Nothing is published: every review starts
 * at "received". The report names rows by their Ref only; the sheet's contact column stays on
 * the person's record, never in a log. Before any consent can be imported, the consent text for
 * publishing a testimonial (the consent message, docs/content/review-consent-request.md) must be
 * under Content → Consent texts, in force from before the earliest consent date.
 */
const file = process.argv[2]
if (!file) {
  console.error('Give the intake sheet: pnpm reviews:import path/to/reviews-intake.xlsx')
  process.exit(1)
}

const payload = await getPayload({ config })
const parsed = parseIntakeRows(await readSheet(file, INTAKE_SHEET))
const report = await importIntake(payload, parsed.rows)

payload.logger.info(
  `Reviews imported: ${report.imported.length}; already imported: ${report.alreadyImported.length}; ` +
    `left alone (empty or the example): ${parsed.skipped}.`,
)
for (const problem of [...parsed.problems, ...report.refused]) {
  payload.logger.warn(
    `Row ${problem.row} (${problem.ref ?? 'no Ref'}): ${problem.messages.join(' ')}`,
  )
}
process.exit(parsed.problems.length + report.refused.length > 0 ? 2 : 0)
