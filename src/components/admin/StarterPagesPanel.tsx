'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import styles from './StarterPages.module.css'
import { STARTER_PAGES_COPY as COPY } from './starterPagesCopy'

export type StarterPageRow = { slug: string; title: string; path: string }

/** The starter pages still to bring in, built from Payload's admin components. */
export function StarterPagesPanel({ pages }: { pages: StarterPageRow[] }) {
  const {
    config: {
      routes: { admin, api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)

  async function start(slug: string) {
    setPending(slug)
    try {
      const response = await fetch(`${serverURL}${api}/pages/from-starter`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        id?: number | string
        message?: string
      }
      // Copied just now, or already here because someone else was quicker: open it either way.
      if ((response.ok || response.status === 409) && data.id !== undefined) {
        router.push(`${admin}/collections/pages/${data.id}`)
        return
      }
      toast.error(data.message ?? COPY.failed)
    } catch {
      toast.error(COPY.offline)
    }
    setPending(null)
  }

  return (
    <section className={styles.panel} aria-labelledby="starter-pages-heading">
      <h2 id="starter-pages-heading" className={styles.heading}>
        {COPY.heading}
      </h2>
      <p className={styles.intro}>{COPY.intro}</p>
      <ul className={styles.list}>
        {pages.map((page) => (
          <li className={styles.row} key={page.slug}>
            <span>
              <strong>{page.title}</strong> <span>{page.path}</span>
            </span>
            <Button
              aria-label={`${COPY.start}: ${page.title}`}
              buttonStyle="secondary"
              disabled={pending !== null}
              margin={false}
              onClick={() => void start(page.slug)}
              size="small"
            >
              {COPY.start}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
