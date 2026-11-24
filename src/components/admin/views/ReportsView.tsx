import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import type { ReportFigure } from '@/lib/adminViews/contract'
import { HEALTH_WAITS_ON, loadReports, readPeriod } from '@/lib/adminViews/reports'
import { dayStart } from '@/lib/adminViews/shared'
import { formatPaise } from '@/lib/office/copy'
import { formatIstDate } from '@/lib/time/ist'

import { firstParam, guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.reports

const dayWords = (day: string) =>
  formatIstDate(new Date(dayStart(day).getTime() + 12 * 60 * 60 * 1000))

/** A figure's value as text first (docs/18 §7): charts come with the interface pass. */
function valueText(value: ReportFigure['value']): string {
  if (!value) return COPY.notCounted
  switch (value.kind) {
    case 'count':
      return String(value.n)
    case 'rate':
      return value.denominator === 0
        ? `${value.numerator} of ${value.denominator}`
        : `${Math.round((value.numerator / value.denominator) * 100)}% (${value.numerator} of ${value.denominator})`
    case 'paise':
      return formatPaise(value.paise)
    case 'hours':
      return `${Math.round(value.median * 10) / 10} hours`
  }
}

function Figure({ figure }: { figure: ReportFigure }) {
  const id = `figure-${figure.key}`
  return (
    <section aria-labelledby={id} className={styles.panel}>
      <h2 className={styles.heading} id={id}>
        {figure.label}
      </h2>
      <p className={styles.figure}>{valueText(figure.value)}</p>
      <dl className={styles.facts}>
        <dt>{COPY.definition}</dt>
        <dd>{figure.definition}</dd>
        <dt>{COPY.working}</dt>
        <dd>{figure.working}</dd>
      </dl>
      {figure.table?.length ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{COPY.figure}</th>
              <th scope="col">{COPY.value}</th>
            </tr>
          </thead>
          <tbody>
            {figure.table.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td data-label={COPY.value}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {figure.href ? (
        <p>
          <Link className={styles.target} href={figure.href}>
            {COPY.records}
          </Link>
        </p>
      ) : null}
    </section>
  )
}

/**
 * Reports (docs/05, Reports; docs/18 §7): each figure with its definition, the period and its
 * working in words, and a link to the records behind it; a figure whose inputs are not built says
 * what it waits on. Owners only: the user, the code and the role are checked before anything is
 * read. The period is a plain GET form, so the address holds it.
 */
export async function ReportsView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'reports')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const now = new Date()
  const query = {
    from: firstParam(props.searchParams, 'from'),
    to: firstParam(props.searchParams, 'to'),
  }
  const loaded = allowed ? await loadReports(req, query, now) : null
  const figures = loaded?.ok ? loaded.value : null
  const period = readPeriod(query, now)
  const shown = period.ok ? period.value : null

  return (
    <ViewFrame allowed={allowed} props={props} title={COPY.title} who={COPY.who}>
      <p className={styles.intro}>{COPY.intro}</p>
      <form action={`${admin}/reports`} className={styles.filters} method="get">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="reports-from">
            {COPY.from}
          </label>
          <input
            className={styles.input}
            defaultValue={shown?.from ?? query.from ?? ''}
            id="reports-from"
            name="from"
            type="date"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="reports-to">
            {COPY.to}
          </label>
          <input
            className={styles.input}
            defaultValue={shown?.to ?? query.to ?? ''}
            id="reports-to"
            name="to"
            type="date"
          />
        </div>
        <button className="btn btn--style-secondary btn--size-medium" type="submit">
          {VIEWS_COPY.show}
        </button>
      </form>
      {loaded && !loaded.ok && loaded.error.code === 'invalid' ? (
        <p className={styles.error} role="alert">
          {loaded.error.issues.join(' ')}
        </p>
      ) : null}
      {figures && shown ? (
        <>
          <p>{COPY.period(dayWords(shown.from), dayWords(shown.to))}</p>
          {figures.map((figure) => (
            <Figure figure={figure} key={figure.key} />
          ))}
          <section aria-labelledby="reports-health" className={styles.section}>
            <h2 id="reports-health">{COPY.health}</h2>
            <ul className={styles.list}>
              {HEALTH_WAITS_ON.map((entry) => (
                <li key={entry.part}>{VIEWS_COPY.waitsOn(entry.part, entry.on)}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </ViewFrame>
  )
}
