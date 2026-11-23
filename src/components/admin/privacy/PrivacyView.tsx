import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { viewRefusal } from '@/access/views'
import type { ClockState } from '@/lib/privacy/breaches'
import {
  loadPrivacyView,
  readConsentFilter,
  type ConsentRow,
  type IncidentRow,
  type RequestRow,
} from '@/lib/privacy/privacyView'
import { CONSENT_PURPOSES } from '@/lib/privacy/purposes'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import styles from './Privacy.module.css'
import { PRIVACY_COPY as COPY } from './privacyCopy'

const when = (value: string | Date | null | undefined) => {
  if (!value) return '—'
  const at = value instanceof Date ? value : new Date(value)
  return Number.isNaN(at.getTime()) ? '—' : `${formatIstDate(at)}, ${formatIstTime(at)}`
}

/** A clock in words, never colour alone (docs/18 §5). */
function clockWords(clock: ClockState, unassessed?: string): string {
  switch (clock.state) {
    case 'done':
      return COPY.clock.done(when(clock.at))
    case 'running':
      return COPY.clock.running(clock.hoursLeft, when(clock.dueAt))
    case 'overdue':
      return COPY.clock.overdue(clock.hoursLate, when(clock.dueAt))
    default:
      return unassessed ?? COPY.clock.notApplicable
  }
}

function Requests({ rows, admin }: { rows: RequestRow[]; admin: string }) {
  if (rows.length === 0) return <p>{COPY.requestsNone}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.kind}</th>
          <th scope="col">{COPY.status}</th>
          <th scope="col">{COPY.received}</th>
          <th scope="col">{COPY.acknowledge}</th>
          <th scope="col">{COPY.resolve}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">
              <Link href={`${admin}/collections/data-requests/${row.id}`}>{row.kind}</Link>
            </th>
            <td data-label={COPY.status}>{row.status}</td>
            <td data-label={COPY.received}>{when(row.receivedAt)}</td>
            <td data-label={COPY.acknowledge}>{clockWords(row.acknowledge)}</td>
            <td data-label={COPY.resolve}>{clockWords(row.resolve)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Incidents({ rows, admin }: { rows: IncidentRow[]; admin: string }) {
  if (rows.length === 0) return <p>{COPY.incidentsNone}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.open}</th>
          <th scope="col">{COPY.detected}</th>
          <th scope="col">{COPY.certIn}</th>
          <th scope="col">{COPY.board}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row">
              <Link href={`${admin}/collections/incidents/${row.id}`}>{row.title}</Link>
            </th>
            <td data-label={COPY.detected}>{when(row.detectedAt)}</td>
            <td data-label={COPY.certIn}>{clockWords(row.certIn, COPY.clock.certInUnassessed)}</td>
            <td data-label={COPY.board}>{clockWords(row.board, COPY.clock.boardUnassessed)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ConsentLog({ rows, admin }: { rows: ConsentRow[]; admin: string }) {
  if (rows.length === 0) return <p>{COPY.consentNone}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.at}</th>
          <th scope="col">{COPY.entryKind}</th>
          <th scope="col">{COPY.purpose}</th>
          <th scope="col">{COPY.person}</th>
          <th scope="col">{COPY.channel}</th>
          <th scope="col">{COPY.notice}</th>
          <th scope="col">{COPY.evidence}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const evidence = [
            row.evidence.form,
            row.evidence.reference,
            row.writtenReceipt,
            row.evidence.device ? COPY.deviceRecorded : null,
          ].filter(Boolean)
          return (
            <tr key={row.id}>
              <th scope="row">
                <Link href={`${admin}/collections/consents/${row.id}`}>{when(row.at)}</Link>
              </th>
              <td data-label={COPY.entryKind}>
                {row.kind === 'given' ? COPY.given : COPY.withdrawn}
              </td>
              <td data-label={COPY.purpose}>{row.purpose}</td>
              <td data-label={COPY.person}>
                {row.personId ? (
                  <Link href={`${admin}/collections/people/${row.personId}`}>{row.personId}</Link>
                ) : (
                  '—'
                )}
              </td>
              <td data-label={COPY.channel}>{row.channel}</td>
              <td data-label={COPY.notice}>
                {row.notice ? (
                  <details>
                    <summary>{row.notice.title}</summary>
                    <p className={styles.notice}>{row.notice.text}</p>
                  </details>
                ) : (
                  '—'
                )}
              </td>
              <td data-label={COPY.evidence}>
                {evidence.length ? evidence.join('; ') : COPY.noEvidence}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Privacy (docs/05; docs/18 §6): open requests by their deadline with time left, the consent log
 * with its filter, and open incidents with both clocks. A custom view is public unless it checks
 * for itself (CLAUDE.md #6): the loader asks `viewRefusal(user, 'privacy')` before it reads
 * anything, then reads with the user's own access. The filter is a plain GET form, so it works
 * without script and its state is in the address.
 */
export async function PrivacyView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const {
    routes: { admin: adminRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user
  const refusal = viewRefusal(user, 'privacy')
  if (refusal?.code === 'sign-in') redirect(`${serverURL}${adminRoute}/login`)
  if (refusal?.code === 'enter-code') redirect(`${serverURL}${adminRoute}`)

  const filter = readConsentFilter(searchParams as Record<string, string | string[] | undefined>)
  const loaded = refusal ? null : await loadPrivacyView(req, filter)
  const data = loaded?.ok ? loaded.value : null

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>{COPY.title}</h1>
        {data ? (
          <>
            <p className={styles.intro}>{COPY.intro}</p>
            <section aria-labelledby="privacy-requests" className={styles.section}>
              <h2 id="privacy-requests">
                {COPY.requests}: {data.requests.length}
              </h2>
              <Requests admin={adminRoute} rows={data.requests} />
            </section>
            <section aria-labelledby="privacy-incidents" className={styles.section}>
              <h2 id="privacy-incidents">
                {COPY.incidents}: {data.incidents.length}
              </h2>
              <Incidents admin={adminRoute} rows={data.incidents} />
            </section>
            <section aria-labelledby="privacy-consents" className={styles.section}>
              <h2 id="privacy-consents">{COPY.consentLog}</h2>
              <p>{COPY.consentIntro}</p>
              <form action={`${adminRoute}/privacy`} className={styles.filters} method="get">
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="consent-person">
                    {COPY.person}
                  </label>
                  <input
                    className={styles.input}
                    defaultValue={filter.person ?? ''}
                    id="consent-person"
                    inputMode="numeric"
                    name="person"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="consent-purpose">
                    {COPY.purpose}
                  </label>
                  <select
                    className={styles.input}
                    defaultValue={filter.purpose ?? ''}
                    id="consent-purpose"
                    name="purpose"
                  >
                    <option value="">{COPY.anyPurpose}</option>
                    {CONSENT_PURPOSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="consent-kind">
                    {COPY.entryKind}
                  </label>
                  <select
                    className={styles.input}
                    defaultValue={filter.kind ?? ''}
                    id="consent-kind"
                    name="kind"
                  >
                    <option value="">{COPY.anyEntry}</option>
                    <option value="given">{COPY.given}</option>
                    <option value="withdrawn">{COPY.withdrawn}</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="consent-from">
                    {COPY.from}
                  </label>
                  <input
                    className={styles.input}
                    defaultValue={filter.from ?? ''}
                    id="consent-from"
                    name="from"
                    type="date"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="consent-to">
                    {COPY.to}
                  </label>
                  <input
                    className={styles.input}
                    defaultValue={filter.to ?? ''}
                    id="consent-to"
                    name="to"
                    type="date"
                  />
                </div>
                <button className={`btn btn--style-secondary btn--size-medium`} type="submit">
                  {COPY.filter}
                </button>
              </form>
              <p>{COPY.shownOf(data.consents.rows.length, data.consents.total)}</p>
              <ConsentLog admin={adminRoute} rows={data.consents.rows} />
            </section>
          </>
        ) : (
          <p>{COPY.notAllowed}</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
