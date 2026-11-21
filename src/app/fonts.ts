import localFont from 'next/font/local'

/**
 * The kit's self-hosted fonts (src/brand/fonts), preloaded through next/font so the
 * first view has no layout shift. The kit's font stacks read these two variables
 * (src/brand/README.md, "Using the kit in Next.js").
 */
export const manrope = localFont({
  src: '../brand/fonts/manrope-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-manrope',
  display: 'swap',
})

/**
 * Fraunces's upright face only, preloaded (D-60): every page sets its headings in it, and the
 * hero's heading is the largest thing on most first views, so the face has to arrive before
 * that heading is drawn. next/font preloads every face of a call, so the italic stays out: no
 * web page sets Fraunces in italic (the kit uses it only for the printed certificate's
 * programme line, which the print templates take from the kit's own CSS). A page that needs
 * the italic brings it back here and keeps the first view within the font budget (docs/12 §2).
 * The size-adjusted fallback keeps the swap from shifting the layout.
 */
export const fraunces = localFont({
  src: '../brand/fonts/fraunces-latin-opsz-normal.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-fraunces',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})
