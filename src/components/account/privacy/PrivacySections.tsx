import Link from 'next/link'

import {
  type AccountSession,
  type DeviceSession,
  GIVABLE_PURPOSES,
  type GivablePurpose,
  OWN_REQUEST_TYPES,
  type OwnRequestRow,
} from '@/lib/accounts/contract'
import {
  giveConsentAction,
  signOutEverywhereAction,
  withdrawConsentAction,
} from '@/lib/accounts/privacy/actions'
import type { OwnConsentRow } from '@/lib/accounts/privacy/consents'
import {
  AGREED_COPY,
  CLOSE_COPY,
  CONTACT_COPY,
  DEVICES_COPY,
  ERROR_COPY,
  MESSAGES_COPY,
  REQUEST_COPY,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
} from '@/lib/accounts/privacy/copy'
import {
  CLOSE_PATH,
  consentBoxId,
  CONTACT_PATH,
  type Outcome,
  PRIVACY_PATH,
} from '@/lib/accounts/privacy/outcome'
import { endedByClosing, isGivable } from '@/lib/accounts/privacy/rules'
import type { RequestFormState } from '@/lib/accounts/privacy/state'
import { REQUEST_SUMMARY_MAX } from '@/lib/privacy/requests'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { OutcomeNote } from './OutcomeNote'
import { OwnRequestForm } from './OwnRequestForm'
import styles from './privacy.module.css'
import { SignInAgain } from './SignInAgain'

/**
 * The sections of My IIIC's privacy page (docs/20 §7.5), in the kit's markup
 * (src/brand/gallery.html): real tables, the form grid, the error summary, plain buttons. Every
 * form posts to a server action, so the page works without JavaScript. Nothing here reads
 * anything: the page hands each section what the account's own functions returned.
 */

const when = (date: Date | null) => (date ? formatIstDate(date) : '')
const at = (date: Date) => `${formatIstDate(date)}, ${formatIstTime(date)}`

function Heading({ id, children }: { id: string; children: string }) {
  return <h2 id={`${id}-heading`}>{children}</h2>
}

export function AgreedSection({
  rows,
  outcome,
}: {
  rows: readonly OwnConsentRow[]
  outcome: Outcome | null
}) {
  const shown = rows.filter((row) => row.state !== 'none')
  return (
    <section id="agreed" aria-labelledby="agreed-heading" className={styles.section}>
      <Heading id="agreed">{AGREED_COPY.heading}</Heading>
      <OutcomeNote outcome={outcome} section="agreed" />
      {shown.length === 0 ? (
        <p>{AGREED_COPY.none}</p>
      ) : (
        <>
          <p>{AGREED_COPY.lead}</p>
          <div className="iiic-table-wrap">
            <table className="iiic-table">
              <caption className="iiic-sr-only">{AGREED_COPY.heading}</caption>
              <thead>
                <tr>
                  <th scope="col">{AGREED_COPY.purpose}</th>
                  <th scope="col">{AGREED_COPY.state}</th>
                  <th scope="col">{AGREED_COPY.since}</th>
                  <th scope="col">
                    <span className="iiic-sr-only">{AGREED_COPY.action}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.purpose}>
                    <th scope="row">{row.label}</th>
                    <td>{row.state === 'granted' ? AGREED_COPY.granted : AGREED_COPY.withdrawn}</td>
                    <td>{when(row.changedAt)}</td>
                    <td>
                      {row.state === 'granted' && endedByClosing(row.purpose) ? (
                        // Withdrawing the account consent is closing the account (D-113).
                        <Link className="iiic-link" href={CLOSE_PATH}>
                          {AGREED_COPY.close}
                        </Link>
                      ) : row.canWithdraw ? (
                        <form action={withdrawConsentAction}>
                          <input type="hidden" name="purpose" value={row.purpose} />
                          <button
                            className="iiic-btn iiic-btn-outline"
                            type="submit"
                            aria-label={`${AGREED_COPY.withdraw}: ${row.label}`}
                          >
                            {AGREED_COPY.withdraw}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

/** One marketing consent offered: the notice in force beside an unticked box, and its button. */
function GiveForm({
  purpose,
  row,
  error,
}: {
  purpose: GivablePurpose
  row: OwnConsentRow
  error: boolean
}) {
  const copy = MESSAGES_COPY.offers[purpose]
  const box = consentBoxId(purpose)
  const titleId = `give-${purpose}-title`
  return (
    <form
      action={giveConsentAction}
      className={`iiic-form-grid ${styles.offer}`}
      aria-labelledby={titleId}
      noValidate
    >
      <div className="full">
        <h3 id={titleId}>{copy.title}</h3>
        {copy.lead ? <p className="iiic-help">{copy.lead}</p> : null}
      </div>
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="noticeVersionId" value={String(row.noticeVersionId)} />
      <div className="full">
        <label className="iiic-check" htmlFor={box}>
          {/* Never ticked for the person (CLAUDE.md #9). */}
          <input
            type="checkbox"
            id={box}
            name="consent"
            value="yes"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${box}-error` : undefined}
          />
          <span className={styles.notice}>{row.noticeText}</span>
        </label>
        {error ? (
          <div className="iiic-error" id={`${box}-error`}>
            {ERROR_COPY.unticked}
          </div>
        ) : null}
      </div>
      <div className="full iiic-row">
        <button className="iiic-btn iiic-btn-primary" type="submit">
          {copy.button}
        </button>
      </div>
    </form>
  )
}

/**
 * The marketing messages My IIIC may offer. `offers` is false while the page names a counselling
 * booking (a correction from "Not your booking?"): nothing is offered beside one (CLAUDE.md #3),
 * and what the person already gets is still said.
 */
export function MessagesSection({
  rows,
  account,
  outcome,
  offers = true,
}: {
  rows: readonly OwnConsentRow[]
  account: Pick<AccountSession, 'verified'>
  outcome: Outcome | null
  offers?: boolean
}) {
  const parts = GIVABLE_PURPOSES.flatMap((purpose) => {
    const row = rows.find((each) => each.purpose === purpose)
    if (row?.state === 'granted') {
      return [<p key={purpose}>{MESSAGES_COPY.offers[purpose].held}</p>]
    }
    if (offers && row?.canGive && row.noticeVersionId && row.noticeText && isGivable(row.purpose)) {
      const error =
        outcome?.section === 'messages' &&
        outcome.code === 'unticked' &&
        outcome.purpose === purpose
      return [<GiveForm key={purpose} purpose={purpose} row={row} error={error} />]
    }
    return []
  })
  const needsEmail = offers && !account.verified.email
  return (
    <section id="messages" aria-labelledby="messages-heading" className={styles.section}>
      <Heading id="messages">{MESSAGES_COPY.heading}</Heading>
      <OutcomeNote outcome={outcome} section="messages" />
      {parts}
      {needsEmail ? <p>{MESSAGES_COPY.needsEmail}</p> : null}
      {parts.length === 0 && !needsEmail ? <p>{MESSAGES_COPY.nothing}</p> : null}
    </section>
  )
}

export function RequestsSection({
  requests,
  recent,
  outcome,
  seed,
}: {
  requests: readonly OwnRequestRow[]
  recent: boolean
  outcome: Outcome | null
  /** What the request form starts with, when the page was opened for one. */
  seed?: RequestFormState['values'] | null
}) {
  return (
    <section id="requests" aria-labelledby="requests-heading" className={styles.section}>
      <Heading id="requests">{REQUEST_COPY.heading}</Heading>
      <OutcomeNote outcome={outcome} section="requests" />
      <p>{REQUEST_COPY.lead}</p>
      {recent ? null : (
        <div className={`iiic-alert iiic-alert-yellow ${styles.outcome}`}>
          <p>{REQUEST_COPY.recent}</p>
          <SignInAgain back="requests" />
        </div>
      )}
      <OwnRequestForm
        types={OWN_REQUEST_TYPES.map((value) => ({ value, label: REQUEST_TYPE_LABELS[value] }))}
        maxLength={REQUEST_SUMMARY_MAX}
        permalink={`${PRIVACY_PATH}#requests`}
        seed={seed ?? null}
      />
      <h3>{REQUEST_COPY.listHeading}</h3>
      {requests.length === 0 ? (
        <p>{REQUEST_COPY.none}</p>
      ) : (
        <div className="iiic-table-wrap">
          <table className="iiic-table">
            <caption className="iiic-sr-only">{REQUEST_COPY.listHeading}</caption>
            <thead>
              <tr>
                <th scope="col">{REQUEST_COPY.request}</th>
                <th scope="col">{REQUEST_COPY.received}</th>
                <th scope="col">{REQUEST_COPY.status}</th>
                <th scope="col">{REQUEST_COPY.due}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <th scope="row">{REQUEST_TYPE_LABELS[request.type]}</th>
                  <td>{when(request.receivedAt)}</td>
                  <td>{REQUEST_STATUS_LABELS[request.status] ?? request.status}</td>
                  <td>{request.status === 'closed' ? '' : when(request.resolveBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function ContactSection({
  account,
  mobileOpen,
  outcome,
}: {
  account: Pick<AccountSession, 'verified'>
  /** Codes on WhatsApp are open here, so a mobile can be added (docs/20 §4.6). */
  mobileOpen: boolean
  outcome: Outcome | null
}) {
  const { email, mobile } = account.verified
  return (
    <section id="contact" aria-labelledby="contact-heading" className={styles.section}>
      <Heading id="contact">{CONTACT_COPY.heading}</Heading>
      <OutcomeNote outcome={outcome} section="contact" />
      <p>{CONTACT_COPY.lead}</p>
      <dl className={styles.details}>
        <div>
          <dt>{CONTACT_COPY.email}</dt>
          <dd>
            {email ?? CONTACT_COPY.none}
            {email ? null : (
              <>
                {' · '}
                <Link className="iiic-link" href={`${CONTACT_PATH}?channel=email`}>
                  {CONTACT_COPY.addEmail}
                </Link>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{CONTACT_COPY.mobile}</dt>
          <dd>
            {mobile ?? CONTACT_COPY.none}
            {mobile || !mobileOpen ? null : (
              <>
                {' · '}
                <Link className="iiic-link" href={`${CONTACT_PATH}?channel=whatsapp`}>
                  {CONTACT_COPY.addMobile}
                </Link>
              </>
            )}
          </dd>
        </div>
      </dl>
    </section>
  )
}

export function DevicesSection({
  devices,
  outcome,
}: {
  devices: readonly DeviceSession[]
  outcome: Outcome | null
}) {
  return (
    <section id="devices" aria-labelledby="devices-heading" className={styles.section}>
      <Heading id="devices">{DEVICES_COPY.heading}</Heading>
      <OutcomeNote outcome={outcome} section="devices" />
      <p>{DEVICES_COPY.lead}</p>
      {devices.length > 0 ? (
        <div className="iiic-table-wrap">
          <table className="iiic-table">
            <caption className="iiic-sr-only">{DEVICES_COPY.heading}</caption>
            <thead>
              <tr>
                <th scope="col">{DEVICES_COPY.device}</th>
                <th scope="col">{DEVICES_COPY.signedIn}</th>
                <th scope="col">{DEVICES_COPY.ends}</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <th scope="row">
                    {device.device ?? DEVICES_COPY.aBrowser}
                    {device.current ? (
                      <>
                        {' '}
                        <span className="iiic-badge iiic-badge-soft">
                          {DEVICES_COPY.thisDevice}
                        </span>
                      </>
                    ) : null}
                  </th>
                  <td>{at(device.signedInAt)}</td>
                  <td>
                    {device.trustedDevice ? at(device.expiresAt) : DEVICES_COPY.browserCloses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form action={signOutEverywhereAction} className={styles.offer}>
        <div className="iiic-row">
          <button
            className="iiic-btn iiic-btn-outline"
            type="submit"
            aria-describedby="devices-help"
          >
            {DEVICES_COPY.button}
          </button>
          <span className="iiic-help" id="devices-help">
            {DEVICES_COPY.help}
          </span>
        </div>
      </form>
    </section>
  )
}

export function CloseSection() {
  return (
    <section id="close" aria-labelledby="close-heading" className={styles.section}>
      <Heading id="close">{CLOSE_COPY.heading}</Heading>
      <p>{CLOSE_COPY.lead}</p>
      <Link className="iiic-btn iiic-btn-outline" href={CLOSE_PATH}>
        {CLOSE_COPY.link}
      </Link>
    </section>
  )
}
