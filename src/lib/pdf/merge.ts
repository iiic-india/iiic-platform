import { err, ok, type Result } from '@/lib/result'

/**
 * Filling a print template's merge fields (src/brand/templates/print/README.md, Rules: "every
 * `{{merge_field}}` is filled before a document is issued; none is guessed"). Pure: the template
 * comes in as text and the document goes out as text, so the tests read exactly what the PDF
 * renderer prints.
 *
 * Every value is escaped, except the few fields that take rows of markup (`{{line_items}}`,
 * `{{phase_rows}}`, `{{fee_rows}}`), which the document modules build here from escaped values.
 * The template's comments (which name merge fields as instructions) are dropped first, so a field
 * named only in a comment is never asked for and never printed.
 */

export type MergeError =
  { code: 'missing-field'; fields: string[] } | { code: 'unknown-field'; fields: string[] }

const FIELD = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const COMMENT = /<!--[\s\S]*?-->/g

/** Text for HTML: the five characters that could open markup or end an attribute. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escaped text whose line breaks print as line breaks (an address typed over several lines). */
export function escapeLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br>')
}

/** A template without its comments. */
export function withoutComments(template: string): string {
  return template.replace(COMMENT, '')
}

/** The merge fields a template asks for, outside its comments, each once, in order. */
export function fieldsOf(template: string): string[] {
  const names = [...withoutComments(template).matchAll(FIELD)].map((match) => match[1] as string)
  return [...new Set(names)]
}

/** Markup the caller has built from escaped values (rows of a table). */
export type Markup = { readonly html: string }

export const markup = (html: string): Markup => ({ html })

export type MergeValues = Readonly<Record<string, string | Markup>>

/**
 * The template with every field filled. A field the template asks for and the values lack is
 * refused (`missing-field`), and so is a value the template does not ask for (`unknown-field`),
 * so a renamed field in the kit fails a test instead of printing a blank.
 */
export function fillTemplate(template: string, values: MergeValues): Result<string, MergeError> {
  const body = withoutComments(template)
  const wanted = fieldsOf(body)
  const missing = wanted.filter((name) => !(name in values))
  if (missing.length) return err({ code: 'missing-field', fields: missing })
  const unknown = Object.keys(values).filter((name) => !wanted.includes(name))
  if (unknown.length) return err({ code: 'unknown-field', fields: unknown })
  return ok(
    body.replace(FIELD, (_whole, name: string) => {
      const value = values[name] as string | Markup
      return typeof value === 'string' ? escapeHtml(value) : value.html
    }),
  )
}

/** The typed placeholder of a fact nobody has supplied yet (CLAUDE.md #1). */
export const todo = (what: string, inputId: string) => `[[TODO: ${what}, ${inputId}]]`

const TODO = /\[\[TODO: [^\]]+\]\]/g

/** The placeholders a filled document still holds; a document to issue holds none. */
export function placeholdersIn(document: string): string[] {
  return [...new Set(document.match(TODO) ?? [])]
}

/**
 * Replaces one exact piece of the template. Used where the kit's own markup must change with the
 * data (the IGST row for a buyer in another state, a buyer without a GSTIN). The piece must be
 * there exactly once, so a change to the kit fails loudly instead of printing the wrong rows.
 */
export function replaceOnce(
  template: string,
  piece: string,
  replacement: string,
): Result<string, { code: 'template-changed'; piece: string }> {
  const first = template.indexOf(piece)
  if (first < 0 || template.indexOf(piece, first + 1) >= 0) {
    return err({ code: 'template-changed', piece })
  }
  return ok(template.slice(0, first) + replacement + template.slice(first + piece.length))
}
