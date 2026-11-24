import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'
import type { ReactNode } from 'react'

import type { Panel, ScheduleItem } from '@/lib/adminViews/contract'
import { isOffice } from '@/lib/adminViews/shared'
import { loadToday } from '@/lib/adminViews/today'
import { BOOKING_TYPES } from '@/lib/booking/states'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { guardView, PanelNote, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.today

const when = (value: string) => {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '' : `${formatIstDate(at)}, ${formatIstTime(at)}`
}

const timeOf = (value: string) => {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '' : formatIstTime(at)
}

/** One panel: its value drawn by `draw`, or why it is not there; nothing when it is not shown. */
function Section<T>({
  id,
  title,
  panel,
  draw,
}: {
  id: string
  title: string
  panel: Panel<T>
  draw: (value: T) => ReactNode
}) {
  if (panel.state === 'not-shown') return null
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id}>{title}</h2>
      {panel.state === 'ready' ? (
        draw(panel.value)
      ) : (
        <PanelNote on={'on' in panel ? panel.on : undefined} state={panel.state} />
      )}
    </section>
  )
}

function Schedule({
  items,
  office,
  admin,
}: {
  items: ScheduleItem[]
  office: boolean
  admin: string
}) {
  if (items.length === 0) return <p>{COPY.scheduleNone}</p>
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">{COPY.time}</th>
          <th scope="col">{COPY.client}</th>
          <th scope="col">{COPY.kind}</th>
          <th scope="col">{COPY.format}</th>
          <th scope="col">{COPY.paid}</th>
          <th scope="col">{COPY.firstTime}</th>
          <th scope="col">{COPY.join}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.bookingId}>
            <th scope="row">
              <Link
                className={styles.target}
                href={`${admin}/collections/bookings/${item.bookingId}${office ? '/office' : ''}`}
              >
                {timeOf(item.startsAt)} – {timeOf(item.endsAt)}
              </Link>
            </th>
            <td data-label={COPY.client}>{item.clientName || VIEWS_COPY.none}</td>
            <td data-label={COPY.kind}>
              {BOOKING_TYPES.find((type) => type.value === item.serviceType)?.label ??
                item.serviceType}
            </td>
            <td data-label={COPY.format}>{item.format ?? VIEWS_COPY.none}</td>
            <td data-label={COPY.paid}>{COPY.paidStates[item.paid]}</td>
            <td data-label={COPY.firstTime}>{item.firstTime ? COPY.yes : COPY.no}</td>
            <td data-label={COPY.join}>
              {item.joinUrl ? (
                <a className={styles.target} href={item.joinUrl} rel="noreferrer" target="_blank">
                  {VIEWS_COPY.open}
                </a>
              ) : (
                VIEWS_COPY.none
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Counts({ rows }: { rows: { kind: string; count: number; href: string }[] }) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.kind}>
          <Link className={styles.target} href={row.href}>
            {row.kind}: {row.count}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Today (docs/05, Today; docs/18 §6): the schedule, who is waiting for a reply, money, proof,
 * privacy deadlines and what failed, each a panel that is ready, could not load, or waits on a
 * later milestone. A practitioner sees their own schedule only. The user, the code and the role
 * are checked before anything is read (guardView, then the loader).
 */
export async function TodayView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'today')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const now = new Date()
  const loaded = allowed ? await loadToday(req, now) : null
  const data = loaded?.ok ? loaded.value : null
  const office = isOffice(req.user)

  return (
    <ViewFrame allowed={data !== null} props={props} title={COPY.title} who={COPY.who}>
      {data ? (
        <>
          <p className={styles.intro}>{COPY.intro(formatIstDate(now))}</p>
          <Section
            draw={(items) => <Schedule admin={admin} items={items} office={office} />}
            id="today-schedule"
            panel={data.schedule}
            title={COPY.schedule}
          />
          <Section
            draw={(items) =>
              items.length === 0 ? (
                <p>{COPY.needsReplyNone}</p>
              ) : (
                <ul className={styles.list}>
                  {items.map((item) => (
                    <li key={item.href}>
                      <Link className={styles.target} href={item.href}>
                        {item.label}
                      </Link>{' '}
                      ({COPY.waiting(item.ageHours)})
                    </li>
                  ))}
                </ul>
              )
            }
            id="today-reply"
            panel={data.needsReply}
            title={COPY.needsReply}
          />
          <Section
            draw={(rows) => <Counts rows={rows} />}
            id="today-money"
            panel={data.money}
            title={COPY.money}
          />
          <Section
            draw={(rows) => <Counts rows={rows} />}
            id="today-proof"
            panel={data.proof}
            title={COPY.proof}
          />
          <Section
            draw={(rows) =>
              rows.length === 0 ? (
                <p>{COPY.privacyNone}</p>
              ) : (
                <ul className={styles.list}>
                  {rows.map((row) => (
                    <li key={row.href}>
                      <Link className={styles.target} href={row.href}>
                        {row.label}
                      </Link>
                      : {COPY.timeLeft(row.hoursLeft, when(row.dueAt))}
                    </li>
                  ))}
                </ul>
              )
            }
            id="today-privacy"
            panel={data.privacy}
            title={COPY.privacy}
          />
          <Section
            draw={(rows) => <Counts rows={rows} />}
            id="today-failures"
            panel={data.failures}
            title={COPY.failures}
          />
          {data.waitsOn.length ? (
            <section aria-labelledby="today-waits" className={styles.section}>
              <h2 id="today-waits">{COPY.notYetBuilt}</h2>
              <ul className={styles.list}>
                {data.waitsOn.map((entry) => (
                  <li key={entry.part}>{VIEWS_COPY.waitsOn(entry.part, entry.on)}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </ViewFrame>
  )
}
