import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * The brand kit's print templates (src/brand/templates/print/), read from disk and made into one
 * self-contained page: the kit's stylesheet with its imports inlined, the fonts and the logo as
 * data addresses. The renderer then loads the page with no file or network access at all, so a
 * PDF made on a server prints exactly what the template shows in a browser, fonts included
 * (README: "the PDF embeds Fraunces and Manrope wherever it is rendered").
 *
 * The files are read from the kit, never copied: a change to a template reaches the documents
 * the next time one is made. A deployment must ship these files with the function that renders
 * (next.config.ts, outputFileTracingIncludes).
 */

export const PRINT_TEMPLATES = ['invoice', 'proposal'] as const

export type PrintTemplate = (typeof PRINT_TEMPLATES)[number]

/** The kit's folder in the deployment. */
export function brandRoot(): string {
  return path.join(process.cwd(), 'src', 'brand')
}

const IMPORT = /@import\s+url\(\s*["']?([^"')]+)["']?\s*\)\s*;/g
const FONT_URL = /url\(\s*["']?(\.\.\/fonts\/[^"')]+\.woff2)["']?\s*\)/g
const STYLESHEET = /<link\s+rel="stylesheet"\s+href="([^"]+\.css)"\s*>/g
const LOGO = /src="(\.\.\/\.\.\/logo\/[^"]+\.svg)"/g

async function dataUrl(file: string, type: string): Promise<string> {
  const bytes = await readFile(file)
  return `data:${type};base64,${bytes.toString('base64')}`
}

/** Replaces each match with the awaited value of `make`, left to right. */
async function replaceAsync(
  text: string,
  pattern: RegExp,
  make: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const parts: string[] = []
  let last = 0
  for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
    parts.push(text.slice(last, match.index), await make(match as RegExpExecArray))
    last = (match.index ?? 0) + match[0].length
  }
  parts.push(text.slice(last))
  return parts.join('')
}

/** A stylesheet with its imports inlined and its fonts as data addresses. */
export async function inlineStylesheet(file: string): Promise<string> {
  const dir = path.dirname(file)
  // The kit's comments are for people reading the files; the page does not need them.
  const css = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
  const imported = await replaceAsync(css, IMPORT, (match) =>
    inlineStylesheet(path.join(dir, match[1] as string)),
  )
  return replaceAsync(
    imported,
    FONT_URL,
    async (match) => `url("${await dataUrl(path.join(dir, match[1] as string), 'font/woff2')}")`,
  )
}

/** A template's page with the kit's stylesheet, fonts and logos inside it. */
export async function selfContained(html: string, templateDir: string): Promise<string> {
  const styled = await replaceAsync(html, STYLESHEET, async (match) => {
    const css = await inlineStylesheet(path.join(templateDir, match[1] as string))
    // Nothing in the kit's CSS closes a style element; refuse rather than break the page.
    if (/<\/style/i.test(css)) throw new Error('The kit stylesheet cannot be inlined')
    return `<style>${css}</style>`
  })
  return replaceAsync(
    styled,
    LOGO,
    async (match) =>
      `src="${await dataUrl(path.join(templateDir, match[1] as string), 'image/svg+xml')}"`,
  )
}

/** A print template as the kit holds it. */
export async function readPrintTemplate(name: PrintTemplate): Promise<string> {
  return readFile(path.join(brandRoot(), 'templates', 'print', `${name}.html`), 'utf8')
}

/** The folder a template's relative addresses start from. */
export function printTemplateDir(): string {
  return path.join(brandRoot(), 'templates', 'print')
}
