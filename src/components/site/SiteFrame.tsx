import type { ReactNode } from 'react'

import { Preview } from './Preview'
import { SiteFooterWithSettings } from './SiteFooterWithSettings'
import { SiteHeader } from './SiteHeader'

export type Register = 'consultancy' | 'education' | 'counselling'

/**
 * The page shell from src/brand/templates/web/page-shell.html: skip link, header,
 * main, footer. The App Router cannot set attributes on <body> per route, so the
 * register sits on this wrapper, with the header and footer inside it, as the kit
 * asks (src/brand/README.md, step 4).
 */
export function SiteFrame({ register, children }: { register?: Register; children: ReactNode }) {
  return (
    <div className="iiic-site" data-register={register}>
      <a className="iiic-skip-link" href="#main">
        Skip to content
      </a>
      {/* Only for staff previewing a draft (docs/15 §5.3, OS-4). */}
      <Preview />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooterWithSettings />
    </div>
  )
}
