import type { Page } from '@/payload-types'

/** What a route needs of a page, whether it comes from the CMS or from the starter pages. */
export type PageContent = Pick<Page, 'title' | 'slug' | 'layout'> &
  Partial<Pick<Page, 'description' | 'facts'>>

export type PageBlock = Page['layout'][number]
