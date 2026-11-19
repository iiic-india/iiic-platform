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

export const fraunces = localFont({
  src: [
    { path: '../brand/fonts/fraunces-latin-opsz-normal.woff2', style: 'normal' },
    { path: '../brand/fonts/fraunces-latin-opsz-italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--font-fraunces',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})
