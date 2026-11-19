import type { ReactNode } from 'react'

import { SiteFooter } from './SiteFooter'
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
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
