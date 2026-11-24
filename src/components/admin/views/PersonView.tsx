import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import { PersonNotes } from '@/components/admin/notes/PersonNotes'
import { isOffice } from '@/lib/adminViews/shared'
import { loadPersonTimeline } from '@/lib/adminViews/timeline'
import { formatPhone } from '@/lib/phone'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.person

const when = (value: string) => {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '' : `${formatIstDate(at)}, ${formatIstTime(at)}`
}

/** The record's number from the address: /admin/people/<id>. */
function personIdFrom(params: AdminViewServerProps['params']): string | undefined {
  const segments = (params as { segments?: string[] } | undefined)?.segments ?? []
  return segments[segments.indexOf('people') + 1]
}

/**
 * The person record (docs/05, People; docs/18 §6): contact details and preferred channel, the
 * consents in force, one timeline of what IIIC holds that this role may read, and the session
 * notes panel: the count for an owner, the author's own notes for a practitioner, nothing for the
 * operator. A practitioner reaches their own clients only; anyone else's record answers as a
 * missing one does. The user, the code and the role are checked before anything is read.
 */
export async function PersonView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'person')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const id = personIdFrom(props.params)
  const loaded = allowed ? await loadPersonTimeline(req, id) : null
  const data = loaded?.ok ? loaded.value : null
  const NotesPanel = PersonNotes as unknown as (props: {
    id: number
    req: typeof req
  }) => Promise<ReactNode>

  return (
    <ViewFrame
      allowed={allowed}
      props={props}
      title={data?.person.fullName ?? COPY.title}
      who={COPY.who}
    >
      {!data ? (
        <p>{COPY.notFound}</p>
      ) : (
        <>
          <section aria-labelledby="person-contact" className={styles.section}>
            <h2 id="person-contact">{COPY.contact}</h2>
            <dl className={styles.facts}>
              <dt>{COPY.mobile}</dt>
              <dd>{data.person.mobile ? formatPhone(data.person.mobile) : VIEWS_COPY.none}</dd>
              <dt>{COPY.email}</dt>
              <dd>{data.person.email ?? VIEWS_COPY.none}</dd>
              {data.person.preferredChannel ? (
                <>
                  <dt>{COPY.channel}</dt>
                  <dd>{data.person.preferredChannel === 'whatsapp' ? 'WhatsApp' : 'Email'}</dd>
                </>
              ) : null}
            </dl>
            {isOffice(req.user) ? (
              <p>
                <Link
                  className={styles.target}
                  href={`${admin}/collections/people/${data.personId}`}
                >
                  {COPY.fullRecord}
                </Link>
              </p>
            ) : null}
          </section>
          {data.consents ? (
            <section aria-labelledby="person-consents" className={styles.section}>
              <h2 id="person-consents">{COPY.consents}</h2>
              {data.consents.length === 0 ? (
                <p>{COPY.consentsNone}</p>
              ) : (
                <ul className={styles.list}>
                  {data.consents.map((consent) => (
                    <li key={`${consent.purpose}-${consent.since}`}>
                      {consent.purpose}, {COPY.since(formatIstDate(new Date(consent.since)))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
          <NotesPanel id={data.personId} req={req} />
          <section aria-labelledby="person-timeline" className={styles.section}>
            <h2 id="person-timeline">{COPY.timeline}</h2>
            {data.entries.length === 0 ? (
              <p>{COPY.timelineNone}</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{COPY.when}</th>
                    <th scope="col">{COPY.what}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry, index) => (
                    <tr key={`${entry.kind}-${index}`}>
                      <th scope="row">{when(entry.at)}</th>
                      <td data-label={COPY.what}>
                        {entry.href ? (
                          <Link className={styles.target} href={entry.href}>
                            {entry.label}
                          </Link>
                        ) : (
                          entry.label
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section aria-labelledby="person-not-shown" className={styles.section}>
            <h2 id="person-not-shown">{COPY.notShown}</h2>
            <ul className={styles.list}>
              {data.notShown.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </ViewFrame>
  )
}
