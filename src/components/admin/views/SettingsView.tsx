import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { loadSettings, readAuditFilter } from '@/lib/adminViews/settings'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { AuditExport } from './AuditExport'
import { guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.settings

const when = (value: string) => {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '' : `${formatIstDate(at)}, ${formatIstTime(at)}`
}

/**
 * Settings (docs/05, Settings; docs/18 §6): where each setting lives, which services are
 * connected (names only, never a key), the flags, and the audit log with filters and an export
 * that asks for the two-factor code again. Owners only: the user, the code and the role are
 * checked before anything is read.
 */
export async function SettingsView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'settings')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const filter = readAuditFilter(
    (props.searchParams ?? {}) as Record<string, string | string[] | undefined>,
  )
  const loaded = allowed ? await loadSettings(req, filter) : null
  const data = loaded?.ok ? loaded.value : null

  return (
    <ViewFrame allowed={data !== null} props={props} title={COPY.title} who={COPY.who}>
      {data ? (
        <>
          <p className={styles.intro}>{COPY.intro}</p>
          <section aria-labelledby="settings-places" className={styles.section}>
            <h2 id="settings-places">{COPY.places}</h2>
            <ul className={styles.list}>
              {data.links.map((link) => (
                <li key={link.href}>
                  <Link className={styles.target} href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="settings-integrations" className={styles.section}>
            <h2 id="settings-integrations">{COPY.integrations}</h2>
            <p>{COPY.integrationsHint}</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{COPY.service}</th>
                  <th scope="col">{COPY.state}</th>
                </tr>
              </thead>
              <tbody>
                {data.integrations.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td data-label={COPY.state}>
                      {row.configured ? COPY.configured : COPY.notConfigured}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="settings-flags" className={styles.section}>
            <h2 id="settings-flags">{COPY.flags}</h2>
            <p>
              <Link className={styles.target} href={`${admin}/globals/settings`}>
                {COPY.flagsHint}
              </Link>
            </p>
            <ul className={styles.list}>
              {data.flags.map((flag) => (
                <li key={flag.label}>
                  {flag.label}: {flag.on ? COPY.on : COPY.off}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="settings-audit" className={styles.section}>
            <h2 id="settings-audit">{COPY.audit}</h2>
            <p>{COPY.auditIntro}</p>
            <form action={`${admin}/settings`} className={styles.filters} method="get">
              <div className={styles.field}>
                <label className={styles.label} htmlFor="audit-entity">
                  {COPY.collection}
                </label>
                <input
                  className={styles.input}
                  defaultValue={filter.entity ?? ''}
                  id="audit-entity"
                  name="entity"
                  placeholder={COPY.anyCollection}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="audit-action">
                  {COPY.action}
                </label>
                <input
                  className={styles.input}
                  defaultValue={filter.action ?? ''}
                  id="audit-action"
                  name="action"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="audit-from">
                  {COPY.from}
                </label>
                <input
                  className={styles.input}
                  defaultValue={filter.from ?? ''}
                  id="audit-from"
                  name="from"
                  type="date"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="audit-to">
                  {COPY.to}
                </label>
                <input
                  className={styles.input}
                  defaultValue={filter.to ?? ''}
                  id="audit-to"
                  name="to"
                  type="date"
                />
              </div>
              <button className="btn btn--style-secondary btn--size-medium" type="submit">
                {COPY.filter}
              </button>
            </form>
            <p>{COPY.shownOf(data.audit.rows.length, data.audit.total)}</p>
            {data.audit.rows.length === 0 ? (
              <p>{COPY.auditNone}</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{COPY.at}</th>
                    <th scope="col">{COPY.actor}</th>
                    <th scope="col">{COPY.action}</th>
                    <th scope="col">{COPY.collection}</th>
                    <th scope="col">{COPY.record}</th>
                    <th scope="col">{COPY.changed}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.rows.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        <Link
                          className={styles.target}
                          href={`${admin}/collections/audit-log/${row.id}`}
                        >
                          {when(row.at)}
                        </Link>
                      </th>
                      <td data-label={COPY.actor}>{row.actor}</td>
                      <td data-label={COPY.action}>{row.action}</td>
                      <td data-label={COPY.collection}>{row.entity}</td>
                      <td data-label={COPY.record}>{row.entityId || VIEWS_COPY.none}</td>
                      <td data-label={COPY.changed}>{row.changed || VIEWS_COPY.none}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <AuditExport
              copy={{
                export: COPY.export,
                exportIntro: COPY.exportIntro,
                code: COPY.code,
                codeHint: COPY.codeHint,
                exportSubmit: COPY.exportSubmit,
                exported: COPY.exported,
                exportFailed: COPY.exportFailed,
                offline: COPY.offline,
              }}
              filter={{ ...filter }}
            />
          </section>
        </>
      ) : null}
    </ViewFrame>
  )
}
