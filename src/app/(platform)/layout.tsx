import '@/brand/dist/iiic.min.css'

import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

import appleIcon from '@/brand/logo/png/apple-touch-icon-180.png'
import { env } from '@/lib/env'

import { fraunces, manrope } from '../fonts'

export const metadata: Metadata = {
  // The configured origin, else production's alias, else this deployment's URL.
  metadataBase: new URL(env().siteUrl),
  title: {
    // docs/12 §3.
    default: 'Indian Institute of Image Catalysts · Subjective Self',
    template: '%s · IIIC',
  },
  // IIIC's own words (content/sources/iiic-philosophy-2026-11-19.md), without "(IIIC)" so
  // the description stays within 155 characters (docs/12 §3).
  description:
    'The Indian Institute of Image Catalysts operates across three distinct service verticals: Education, Counselling, and Business & Management Consultancy.',
  applicationName: 'IIIC',
  // The tab icon is IIIC's own (src/app/icon.svg, D-48). Next.js links src/app/favicon.ico by
  // itself, for browsers that take no SVG. The home-screen icon is the kit's, used as it is.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: appleIcon.src, sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#FFDD00',
  colorScheme: 'only light',
}

export default async function PlatformRootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request, so that Next.js can put the CSP nonce on its scripts
  // (D-42); CMS data is cached by tag instead of the page (docs/12 §1).
  await connection()
  return (
    <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
