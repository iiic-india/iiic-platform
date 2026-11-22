import { chromium, type Browser } from 'playwright-core'

/**
 * HTML to PDF with headless Chromium (D-09; docs/07, PDFs): `playwright-core` drives the browser,
 * which on Vercel is `@sparticuz/chromium` (a Chromium built for serverless functions) and
 * anywhere else the Chromium Playwright installs (development, CI). The kit's templates are
 * verified in Chromium 131 and later, which draws their page margin boxes (the bar, the footer,
 * "Page n of N"); both builds are newer.
 *
 * The page comes in self-contained (src/lib/pdf/templates.ts) and every request it makes is
 * refused, so a document can neither fetch nor send anything while it is printed. The options are
 * the kit's own (src/brand/templates/print/README.md, Rendering PDFs).
 */

export const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true } as const

const TIMEOUT_MS = 30_000

export type RenderOptions = {
  /** True on a serverless deployment (Vercel): use the serverless Chromium build. */
  serverless: boolean
}

async function launch({ serverless }: RenderOptions): Promise<Browser> {
  if (!serverless) return chromium.launch({ headless: true })
  // Loaded only where it runs: it unpacks its browser into the function's temporary folder.
  const { default: Serverless } = await import('@sparticuz/chromium')
  return chromium.launch({
    executablePath: await Serverless.executablePath(),
    args: Serverless.args,
    headless: true,
  })
}

/** The page printed as a PDF, as the kit prints it. */
export async function renderPdf(html: string, options: RenderOptions): Promise<Uint8Array> {
  const browser = await launch(options)
  try {
    const context = await browser.newContext({ offline: true })
    // Data addresses never reach the router; anything else the page asks for is refused.
    await context.route('**/*', (route) => route.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(TIMEOUT_MS)
    await page.emulateMedia({ media: 'print' })
    await page.setContent(html, { waitUntil: 'load' })
    // The fonts are inlined, but are only drawn once loaded.
    await page.evaluate(() => document.fonts.ready.then(() => true))
    const pdf = await page.pdf(PDF_OPTIONS)
    return new Uint8Array(pdf)
  } finally {
    await browser.close()
  }
}
