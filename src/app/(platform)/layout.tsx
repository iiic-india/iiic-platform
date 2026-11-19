import '@/brand/dist/iiic.min.css'

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { fraunces, manrope } from '../fonts'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Indian Institute of Image Catalysts',
    template: '%s · IIIC',
  },
  // IIIC's own words (content/sources/iiic-philosophy-2026-11-19.md).
  description:
    'The Indian Institute of Image Catalysts (IIIC) operates across three distinct service verticals: Education, Counselling, and Business & Management Consultancy.',
  applicationName: 'IIIC',
}

export const viewport: Viewport = {
  themeColor: '#FFDD00',
  colorScheme: 'only light',
}

export default function PlatformRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
