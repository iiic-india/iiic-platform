import type { ReactNode } from 'react'

import { TITLE_SUFFIX } from '@/lib/seo/site'
import { CONTACT, mailHref } from '@/lib/site/contact'

import styles from './ServerError.module.css'

/**
 * The tab's title. Next.js gives a failed page no metadata, so the page names itself: React puts
 * a <title> drawn anywhere into the document's head (WCAG 2.4.2, a page has a title).
 */
export const SERVER_ERROR_TITLE = `Something went wrong${TITLE_SUFFIX}`

/**
 * The 500 page's words (docs/11 §5.2): plain, no question, no device. The reference is the
 * error's digest, which Next.js writes to the server's log with the error and Sentry records as
 * a tag (src/lib/monitoring/sentry.ts), so a person who quotes it can be matched to the report.
 * Without one (an error raised in the browser, which nothing logs yet, D-49), the page says
 * nothing about a log and asks for no reference. The address is the one the site publishes
 * (src/lib/site/contact.ts) until the platform's own addresses exist (I-02). Imported by the
 * error boundaries, which run in the browser, so it holds nothing that belongs on the server.
 * `children` follow the words in the page column: on a counselling page, the scope statement
 * and the crisis numbers (CLAUDE.md #9).
 */
export function ServerError({ reference, children }: { reference?: string; children?: ReactNode }) {
  return (
    <section className={`iiic-page ${styles.page}`}>
      <title>{SERVER_ERROR_TITLE}</title>
      <h1 className={styles.heading}>Something went wrong on our side.</h1>
      <p className="iiic-lede iiic-prose">
        {reference ? (
          <>
            It has been logged with the reference{' '}
            <code className={styles.reference}>{reference}</code>.{' '}
          </>
        ) : null}
        Try again in a minute; if it keeps happening, write to{' '}
        <a className="iiic-link" href={mailHref(CONTACT.email)}>
          {CONTACT.email}
        </a>
        {reference ? ' and quote the reference' : null}.
      </p>
      {children}
    </section>
  )
}
