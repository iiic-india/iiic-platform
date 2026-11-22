import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import type { AdminViewServerProps, PayloadRequest } from 'payload'

import { WEEKDAYS } from '@/fields/workingSpans'
import { istDayOf } from '@/lib/booking/slots'
import { whoseHours } from '@/lib/office/actions'
import { officeErrorMessage } from '@/lib/office/copy'
import { isOfficeUser, refusalFor } from '@/lib/office/who'
import { officeActions } from '@/lib/office/wiring'
import { formatIstTime } from '@/lib/time/ist'
import type { Practitioner, Service } from '@/payload-types'

import styles from './Office.module.css'
import { OFFICE_VIEW_COPY as COPY } from './officeViewCopy'
import { formatDay, labelOf, requireStaffWithCode } from './shared'

type Spans = { start: string; end: string }[] | null | undefined
const spansText = (spans: Spans) =>
  (spans ?? []).map((span) => `${span.start}–${span.end}`).join(', ')

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/** The bookable options a profile offers: active sessions and calls, with a set length. */
async function optionsOf(req: PayloadRequest, practitioner: Practitioner) {
  const ids = (practitioner.services ?? []).map((service) =>
    typeof service === 'number' ? service : service.id,
  )
  if (ids.length === 0) return []
  const { docs } = await req.payload.find({
    collection: 'services',
    where: {
      and: [
        { id: { in: ids } },
        { active: { equals: true } },
        { type: { in: ['session', 'call'] } },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs.flatMap((service: Service) =>
    (service.options ?? [])
      .filter((option) => option.id && typeof option.duration === 'number' && option.duration > 0)
      .map((option) => ({
        value: `${service.id}:${option.id}`,
        label: `${service.name}: ${option.label ? `${option.label}, ` : ''}${COPY.minutes(option.duration as number)}`,
      })),
  )
}

async function Preview({
  req,
  practitionerId,
  option,
}: {
  req: PayloadRequest
  practitionerId: number
  option: string
}) {
  const preview = await officeActions().previewHours(req, { practitionerId, option })
  if (!preview.ok) return <p role="status">{officeErrorMessage(preview.error)}</p>
  return (
    <div role="status">
      {preview.value.calendarConnected ? null : (
        <p className={styles.hint}>{COPY.calendarNotConnected}</p>
      )}
      {preview.value.days.length === 0 ? (
        <p>{COPY.previewNone}</p>
      ) : (
        preview.value.days.map((day) => (
          <section aria-label={formatDay(day.day)} key={day.day}>
            <h3>{formatDay(day.day)}</h3>
            <ul className={styles.times}>
              {day.starts.map((start) => (
                <li key={start}>{formatIstTime(new Date(start))}</li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/**
 * Calendar → Working hours (docs/05, Calendar; docs/16 §12, E): a practitioner's weekly hours and
 * exceptions, with links to add and change them in their collections (where the own-profile check
 * holds a practitioner to their own, src/lib/booking/availabilityHooks.ts), and a preview of the
 * times a client would be offered for one of their services. A practitioner sees their own; the
 * office picks anyone's. The user, the code and the role are checked first.
 */
export async function WorkingHoursView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  requireStaffWithCode(req)
  const admin = req.payload.config.routes.admin
  const office = isOfficeUser(req.user)
  const allowed = refusalFor(req.user, 'hours') === null
  const asked = Number(first(searchParams?.practitioner))
  const option = first(searchParams?.option)

  const whose = allowed
    ? await whoseHours(req, Number.isInteger(asked) && asked > 0 ? asked : undefined)
    : null
  const practitioner = whose?.ok ? whose.value : null
  const everyone = office
    ? (
        await req.payload.find({
          collection: 'practitioners',
          depth: 0,
          pagination: false,
          sort: 'publicName',
          overrideAccess: false,
          req,
        })
      ).docs
    : []

  const today = istDayOf(new Date())
  const [rules, exceptions, options] = practitioner
    ? await Promise.all([
        req.payload.find({
          collection: 'availability-rules',
          where: { practitioner: { equals: practitioner.id } },
          depth: 0,
          pagination: false,
          sort: 'validFrom',
          overrideAccess: true,
          req,
        }),
        req.payload.find({
          collection: 'availability-exceptions',
          where: {
            and: [
              { practitioner: { equals: practitioner.id } },
              { day: { greater_than_equal: today } },
            ],
          },
          depth: 0,
          pagination: false,
          sort: 'day',
          overrideAccess: true,
          req,
        }),
        optionsOf(req, practitioner),
      ])
    : [null, null, []]

  const weekdayOrder = (value: string) => WEEKDAYS.findIndex((day) => day.value === value)

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>{COPY.hoursTitle}</h1>
        {!allowed ? (
          <p>{officeErrorMessage({ code: 'not-allowed' })}</p>
        ) : (
          <>
            <p className={styles.intro}>{COPY.hoursIntro}</p>
            {office ? (
              <form action={`${admin}/working-hours`} className={styles.form} method="get">
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="hours-practitioner">
                    {COPY.whose}
                  </label>
                  <select
                    className={styles.input}
                    defaultValue={practitioner?.id ?? ''}
                    id="hours-practitioner"
                    name="practitioner"
                    required
                  >
                    <option value="">{COPY.choosePractitioner}</option>
                    {everyone.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.publicName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.actions}>
                  <button className="btn btn--style-secondary btn--size-medium" type="submit">
                    {COPY.show}
                  </button>
                </div>
              </form>
            ) : null}
            {whose && !whose.ok && !(office && whose.error.code === 'invalid-input') ? (
              <p>{officeErrorMessage(whose.error)}</p>
            ) : null}

            {practitioner && rules && exceptions ? (
              <>
                <section aria-labelledby="hours-weekly" className={styles.panel}>
                  <h2 id="hours-weekly">
                    {COPY.weekly}: {practitioner.publicName}
                  </h2>
                  {rules.docs.length === 0 ? (
                    <p>{COPY.weeklyNone}</p>
                  ) : (
                    <table className={styles.table}>
                      <tbody>
                        {[...rules.docs]
                          .sort((a, b) => weekdayOrder(a.weekday) - weekdayOrder(b.weekday))
                          .map((rule) => (
                            <tr key={rule.id}>
                              <th scope="row">{labelOf(WEEKDAYS, rule.weekday)}</th>
                              <td>{spansText(rule.spans)}</td>
                              <td>
                                {COPY.from} {formatDay(rule.validFrom)}
                                {rule.validTo ? ` ${COPY.until} ${formatDay(rule.validTo)}` : ''}
                              </td>
                              <td>
                                <Link href={`${admin}/collections/availability-rules/${rule.id}`}>
                                  {COPY.edit}
                                </Link>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                  <p>
                    <Link href={`${admin}/collections/availability-rules/create`}>
                      {COPY.addHours}
                    </Link>
                  </p>
                </section>

                <section aria-labelledby="hours-exceptions" className={styles.panel}>
                  <h2 id="hours-exceptions">{COPY.exceptions}</h2>
                  {exceptions.docs.length === 0 ? (
                    <p>{COPY.exceptionsNone}</p>
                  ) : (
                    <table className={styles.table}>
                      <tbody>
                        {exceptions.docs.map((exception) => (
                          <tr key={exception.id}>
                            <th scope="row">{formatDay(exception.day)}</th>
                            <td>
                              {exception.kind === 'closed'
                                ? COPY.closed
                                : spansText(exception.spans)}
                            </td>
                            <td>
                              <Link
                                href={`${admin}/collections/availability-exceptions/${exception.id}`}
                              >
                                {COPY.edit}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p>
                    <Link href={`${admin}/collections/availability-exceptions/create`}>
                      {COPY.addException}
                    </Link>
                  </p>
                </section>

                <section aria-labelledby="hours-preview" className={styles.panel}>
                  <h2 id="hours-preview">{COPY.previewTitle}</h2>
                  {options.length === 0 ? (
                    <p>{COPY.previewNoOptions}</p>
                  ) : (
                    <form action={`${admin}/working-hours`} className={styles.form} method="get">
                      {office ? (
                        <input name="practitioner" type="hidden" value={practitioner.id} />
                      ) : null}
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor="hours-option">
                          {COPY.previewOption}
                        </label>
                        <select
                          className={styles.input}
                          defaultValue={option ?? ''}
                          id="hours-option"
                          name="option"
                          required
                        >
                          <option value="">{COPY.previewChoose}</option>
                          {options.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.actions}>
                        <button className="btn btn--style-primary btn--size-medium" type="submit">
                          {COPY.previewSubmit}
                        </button>
                      </div>
                    </form>
                  )}
                  {option ? (
                    <Preview option={option} practitionerId={practitioner.id} req={req} />
                  ) : null}
                </section>
              </>
            ) : null}
          </>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
