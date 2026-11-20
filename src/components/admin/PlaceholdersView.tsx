import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { loadPlaceholderReport } from '@/lib/content/placeholderReport'
import { COPY_APPROVAL, LEGAL_REVIEW, type PageRef, type Report } from '@/lib/content/placeholders'

import styles from './Placeholders.module.css'
import { PLACEHOLDERS_COPY as COPY } from './placeholdersCopy'

/** A page of the report: its name links to the admin if it is there, else to the site. */
function PageLink({ page }: { page: PageRef }) {
  return (
    <>
      <Link href={page.href}>{page.title}</Link> <span>{page.path}</span>
      {page.inAdmin ? null : <span> ({COPY.notInAdmin})</span>}
    </>
  )
}

function Missing({ rows }: { rows: Report['missing'] }) {
  if (rows.length === 0) return <p>{COPY.missingNone}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.input}</th>
          <th scope="col">{COPY.what}</th>
          <th scope="col">{COPY.page}</th>
          <th scope="col">{COPY.section}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.id}-${row.page.path}-${index}`}>
            <th className={styles.input} scope="row">
              {row.id}
            </th>
            <td>{row.what}</td>
            <td>
              <PageLink page={row.page} />
            </td>
            <td>{row.section}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Waiting({
  rows,
  column,
  none,
}: {
  rows: { page: PageRef; names: string[] }[]
  column: string
  none: string
}) {
  if (rows.length === 0) return <p>{none}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.page}</th>
          <th scope="col">{column}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.page.path}-${row.page.inAdmin}`}>
            <th scope="row">
              <PageLink page={row.page} />
            </th>
            <td>
              <ul className={styles.names}>
                {row.names.map((name, index) => (
                  <li key={`${name}-${index}`}>{name}</li>
                ))}
              </ul>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** How many of something a heading announces. */
const count = (label: string, total: number, input?: string) =>
  `${label}${input ? ` (${input})` : ''}: ${total}`

/**
 * Content → Placeholders (docs/05; D-56): what the pages still wait for, across the pages in
 * the admin and the starter pages not brought in yet. A custom view is public unless it checks
 * for itself (CLAUDE.md #6): no one sees it without a staff sign-in and the two-factor code,
 * and the report is read only for the roles that may read draft pages, with their own access.
 */
export async function PlaceholdersView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const {
    routes: { admin: adminRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user
  if (!user) redirect(`${serverURL}${adminRoute}/login`)
  // Without the code this session may not read the admin: its own views ask for the code.
  if ((user as { _strategy?: string })._strategy !== 'totp') redirect(`${serverURL}${adminRoute}`)

  const report = hasRole(user, ...POLICY.pages.read.roles)
    ? await loadPlaceholderReport(req.payload, user, adminRoute)
    : null

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>{COPY.title}</h1>
        {report ? (
          <>
            <p className={styles.intro}>{COPY.intro}</p>
            <section aria-labelledby="placeholders-missing">
              <h2 id="placeholders-missing">{count(COPY.missing, report.missing.length)}</h2>
              <Missing rows={report.missing} />
            </section>
            <section aria-labelledby="placeholders-candidates">
              <h2 id="placeholders-candidates">
                {count(
                  COPY.candidates,
                  report.candidates.reduce((sum, entry) => sum + entry.sections.length, 0),
                  COPY_APPROVAL,
                )}
              </h2>
              <Waiting
                rows={report.candidates.map(({ page, sections }) => ({ page, names: sections }))}
                column={COPY.sections}
                none={COPY.candidatesNone}
              />
            </section>
            <section aria-labelledby="placeholders-legal">
              <h2 id="placeholders-legal">
                {count(
                  COPY.legal,
                  report.legal.reduce((sum, entry) => sum + entry.items.length, 0),
                  LEGAL_REVIEW,
                )}
              </h2>
              <Waiting
                rows={report.legal.map(({ page, items }) => ({ page, names: items }))}
                column={COPY.waiting}
                none={COPY.legalNone}
              />
            </section>
          </>
        ) : (
          <p>{COPY.notAllowed}</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
