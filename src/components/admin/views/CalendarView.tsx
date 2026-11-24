import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { mayOpen } from '@/access/views'
import { OfficeActionForm } from '@/components/admin/office/OfficeActionForm'
import { DATETIME_STEP_SECONDS } from '@/components/admin/office/shared'
import { loadCalendar, readCalendarQuery } from '@/lib/adminViews/calendar'
import type { CalendarData, CalendarEntry } from '@/lib/adminViews/contract'
import { addDays, dayStart, isOffice } from '@/lib/adminViews/shared'
import { BOOKING_STATUSES, BOOKING_TYPES } from '@/lib/booking/states'
import { formatIstDate, formatIstTime, istDay } from '@/lib/time/ist'

import { firstParam, guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.calendar

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long' })

/** A day as VOICE.md writes it: Monday, 4 January 2027. */
const dayHeading = (day: string) => {
  const noon = new Date(dayStart(day).getTime() + 12 * 60 * 60 * 1000)
  return `${WEEKDAY.format(noon)}, ${formatIstDate(noon)}`
}

const timeOf = (value: string) => formatIstTime(new Date(value))

const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((entry) => entry.value === value)?.label ?? value

function Entry({
  entry,
  names,
  admin,
  moves,
}: {
  entry: CalendarEntry
  names: Map<number, string>
  admin: string
  moves: boolean
}) {
  const who = names.get(entry.practitionerId)
  if (entry.kind === 'closed') {
    return (
      <li>
        {COPY.closed}
        {who ? ` (${who})` : ''}
      </li>
    )
  }
  if (entry.kind === 'busy') {
    return (
      <li>
        {timeOf(entry.startsAt)} – {timeOf(entry.endsAt)}: {COPY.busy}
        {who ? ` (${who})` : ''}
      </li>
    )
  }
  const { item } = entry
  const headingId = `move-${item.bookingId}`
  return (
    <li>
      <Link
        className={styles.target}
        href={`${admin}/collections/bookings/${item.bookingId}${moves ? '/office' : ''}`}
      >
        {timeOf(item.startsAt)} – {timeOf(item.endsAt)}: {item.clientName || item.reference}
      </Link>{' '}
      ({labelOf(BOOKING_TYPES, item.serviceType)}, {labelOf(BOOKING_STATUSES, item.status)},{' '}
      {VIEWS_COPY.today.paidStates[item.paid].toLowerCase()}
      {who ? `, ${who}` : ''})
      {moves && item.status === 'confirmed' ? (
        <details>
          <summary className={styles.target} id={headingId}>
            {COPY.move}
          </summary>
          <OfficeActionForm
            labelledBy={headingId}
            path={`/bookings/${item.bookingId}/reschedule`}
            submitLabel={COPY.moveSubmit}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${headingId}-time`}>
                {COPY.newTime}
              </label>
              <input
                aria-describedby={`${headingId}-hint`}
                className={styles.input}
                id={`${headingId}-time`}
                name="startsAt"
                required
                step={DATETIME_STEP_SECONDS}
                type="datetime-local"
              />
              <p className={styles.hint} id={`${headingId}-hint`}>
                {COPY.newTimeHint}
              </p>
            </div>
          </OfficeActionForm>
        </details>
      ) : null}
    </li>
  )
}

function Days({ data, admin, moves }: { data: CalendarData; admin: string; moves: boolean }) {
  const names = new Map(data.practitioners.map((entry) => [entry.id, entry.name]))
  return (
    <>
      {data.days.map(({ day, entries }) => (
        <section aria-labelledby={`day-${day}`} className={styles.day} key={day}>
          <h2 id={`day-${day}`}>{dayHeading(day)}</h2>
          {entries.length === 0 ? (
            <p>{COPY.nothing}</p>
          ) : (
            <ul className={styles.list}>
              {entries.map((entry, index) => (
                <Entry admin={admin} entry={entry} key={index} moves={moves} names={names} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

/**
 * Calendar (docs/05, Calendar; docs/18 §6): a week from Monday or one day, in India time, with a
 * filter by practitioner for the office. A confirmed booking can be moved with M3's office action
 * (it checks the user, the role and the code again, and the slot); there is no drag. The filter is
 * a plain GET form, so the address holds its state.
 */
export async function CalendarView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'calendar')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const today = istDay(new Date())
  const loaded = allowed
    ? await loadCalendar(
        req,
        readCalendarQuery(
          (props.searchParams ?? {}) as Record<string, string | string[] | undefined>,
          today,
        ),
      )
    : null
  const data = loaded?.ok ? loaded.value : null
  const office = isOffice(req.user)
  const moves = mayOpen(req.user, 'reschedule')
  const step = data?.query.view === 'day' ? 1 : 7
  const linkFor = (day: string) => {
    const query = new URLSearchParams({ view: data?.query.view ?? 'week', day })
    if (data?.query.practitionerId) query.set('practitionerId', String(data.query.practitionerId))
    return `${admin}/calendar?${query.toString()}`
  }

  return (
    <ViewFrame allowed={allowed} props={props} title={COPY.title} who={COPY.who}>
      <p className={styles.intro}>{COPY.intro}</p>
      {loaded && !loaded.ok ? <p className={styles.error}>{VIEWS_COPY.invalid}</p> : null}
      <form action={`${admin}/calendar`} className={styles.filters} method="get">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="calendar-view">
            {COPY.view}
          </label>
          <select
            className={styles.input}
            defaultValue={data?.query.view ?? 'week'}
            id="calendar-view"
            name="view"
          >
            <option value="week">{COPY.week}</option>
            <option value="day">{COPY.day}</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="calendar-day">
            {COPY.date}
          </label>
          <input
            className={styles.input}
            defaultValue={data?.query.day ?? firstParam(props.searchParams, 'day') ?? today}
            id="calendar-day"
            name="day"
            type="date"
          />
        </div>
        {office && data ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="calendar-practitioner">
              {COPY.practitioner}
            </label>
            <select
              className={styles.input}
              defaultValue={data.query.practitionerId ?? ''}
              id="calendar-practitioner"
              name="practitionerId"
            >
              <option value="">{COPY.everyone}</option>
              {data.practitioners.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button className="btn btn--style-secondary btn--size-medium" type="submit">
          {VIEWS_COPY.show}
        </button>
      </form>
      {data ? (
        <>
          <p className={styles.row}>
            <Link className={styles.target} href={linkFor(addDays(data.query.day, -step))}>
              {COPY.previous}
            </Link>
            <Link className={styles.target} href={linkFor(addDays(data.query.day, step))}>
              {COPY.next}
            </Link>
          </p>
          <Days admin={admin} data={data} moves={moves} />
        </>
      ) : null}
    </ViewFrame>
  )
}
