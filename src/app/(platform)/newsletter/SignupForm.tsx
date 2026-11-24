import { TurnstileWidget } from '@/components/forms/TurnstileWidget'
import { SIGNUP_COPY } from '@/lib/newsletter/copy'
import { NEWSLETTER_PATHS } from '@/lib/newsletter/rules'

import { FocusOnArrival } from './FocusOnArrival'
import styles from './newsletter.module.css'

const EMAIL_ID = 'newsletter-email'
const SUMMARY_ID = 'newsletter-errors'

/**
 * The newsletter's signup form (docs/19 §8; D-10): one labelled field, a plain POST that works
 * without JavaScript, and the notice in force shown above the button exactly as IIIC wrote it.
 * Nothing is ticked for the person and nothing else is asked. The Journal's pages place it at
 * the join; `/newsletter` shows it on its own. The trap field is hidden from people and from
 * screen readers; a bot that fills it is answered as if it had signed up. Where Turnstile's keys
 * are set, its check sits above the button, as on the enquiry forms.
 */
export function SignupForm({
  notice,
  source,
  invalid = false,
  turnstileSiteKey = null,
}: {
  /** The consent text for marketing email in force, or null: then the form does not ask. */
  notice: string | null
  /** The page the form is on, recorded with the signup. */
  source?: string
  invalid?: boolean
  /** Turnstile's site key where both its keys are set; null draws no check. */
  turnstileSiteKey?: string | null
}) {
  if (!notice) return <p>{SIGNUP_COPY.closed}</p>
  return (
    <form className={styles.form} method="post" action={NEWSLETTER_PATHS.signup} noValidate>
      {invalid ? (
        <>
          <div className="iiic-error-summary" role="alert" tabIndex={-1} id={SUMMARY_ID}>
            <h2>{SIGNUP_COPY.summary}</h2>
            <ul>
              <li>
                <a href={`#${EMAIL_ID}`}>{SIGNUP_COPY.invalid}</a>
              </li>
            </ul>
          </div>
          <FocusOnArrival id={SUMMARY_ID} />
        </>
      ) : null}
      <div className="iiic-field-wrap">
        <label className="iiic-label" htmlFor={EMAIL_ID}>
          {SIGNUP_COPY.label}
        </label>
        <input
          className="iiic-field"
          id={EMAIL_ID}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${EMAIL_ID}-error ${EMAIL_ID}-help` : `${EMAIL_ID}-help`}
        />
        {invalid ? (
          <div className="iiic-error" id={`${EMAIL_ID}-error`}>
            {SIGNUP_COPY.invalid}
          </div>
        ) : null}
        <div className="iiic-help" id={`${EMAIL_ID}-help`}>
          {SIGNUP_COPY.help}
        </div>
      </div>
      {source ? <input type="hidden" name="source" value={source} /> : null}
      <div hidden>
        <label htmlFor="newsletter-website">Leave this empty</label>
        <input
          id="newsletter-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <h2 className="iiic-label">{SIGNUP_COPY.noticeHeading}</h2>
      <p className={`iiic-help ${styles.notice}`}>{notice}</p>
      {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} action="newsletter" /> : null}
      <button className="iiic-btn iiic-btn-primary" type="submit">
        {SIGNUP_COPY.button}
      </button>
    </form>
  )
}
