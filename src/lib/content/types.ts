import type { Page } from '@/payload-types'

/** What a route needs of a page, whether it comes from the CMS or from the starter pages. */
export type PageContent = Pick<Page, 'title' | 'slug' | 'layout'> &
  Partial<Pick<Page, 'description' | 'facts' | 'legalReview'>>

export type PageBlock = Page['layout'][number]

/** A published question as a page shows it, in its questions section and its structured data. */
export type FaqItem = { id: string; question: string; answer: string }
