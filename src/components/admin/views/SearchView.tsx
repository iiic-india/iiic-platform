import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import type { SearchHit } from '@/lib/adminViews/contract'
import { searchAdmin } from '@/lib/adminViews/search'

import { firstParam, guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.search

const ORDER: SearchHit['kind'][] = [
  'person',
  'booking',
  'invoice',
  'certificate',
  'organisation',
  'lead',
]

/**
 * Global search (docs/05, Navigation; docs/18 §7): one field, hits grouped by kind, five each, as
 * plain links a keyboard moves through in order. What each role finds is its own (the loader reads
 * with the user's access); notes, Map answers, messages, review texts and feedback comments are
 * never searched. The query lives in the address only; it is not logged or stored.
 */
export async function SearchView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'search')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const q = firstParam(props.searchParams, 'q') ?? ''
  const loaded = allowed && q ? await searchAdmin(req, { q }) : null
  const hits = loaded?.ok ? loaded.value : null

  return (
    <ViewFrame allowed={allowed} props={props} title={COPY.title} who={COPY.who}>
      <p className={styles.intro}>{COPY.intro}</p>
      <form action={`${admin}/search`} className={styles.filters} method="get" role="search">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="admin-search">
            {COPY.label}
          </label>
          <input
            aria-describedby="admin-search-hint"
            autoComplete="off"
            className={styles.input}
            defaultValue={q}
            id="admin-search"
            maxLength={100}
            minLength={2}
            name="q"
            type="search"
          />
          <p className={styles.hint} id="admin-search-hint">
            {COPY.hint}
          </p>
        </div>
        <button className="btn btn--style-primary btn--size-medium" type="submit">
          {COPY.submit}
        </button>
      </form>
      {loaded && !loaded.ok ? (
        <p className={styles.error} role="alert">
          {COPY.tooShort}
        </p>
      ) : null}
      {hits ? (
        hits.length === 0 ? (
          <p role="status">{COPY.none}</p>
        ) : (
          ORDER.filter((kind) => hits.some((hit) => hit.kind === kind)).map((kind) => (
            <section aria-labelledby={`hits-${kind}`} className={styles.section} key={kind}>
              <h2 id={`hits-${kind}`}>{COPY.kinds[kind]}</h2>
              <ul className={styles.list}>
                {hits
                  .filter((hit) => hit.kind === kind)
                  .map((hit) => (
                    <li key={`${kind}-${hit.id}`}>
                      <Link className={styles.target} href={hit.href}>
                        {hit.label}
                      </Link>
                      {hit.detail ? ` (${hit.detail})` : ''}
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )
      ) : null}
    </ViewFrame>
  )
}
