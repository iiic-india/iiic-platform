'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { TEAM_SIZE_BANDS } from '@/lib/pipeline/values'
import {
  type EnquiryFormState,
  type FormSetup,
  HIDDEN,
  INITIAL_FORM_STATE,
  type NoticeShown,
  UTM_KEYS,
} from '@/lib/enquiryForms/state'
import {
  CHOOSE,
  checkAnswers,
  type EnquiryFormKind,
  FORM_COPY,
  type FormField,
  NOT_SENT,
  PRIVACY_NOTICE,
  REFUSALS,
  TRAP_LABEL,
} from '@/lib/enquiryForms/strings'

import { Acknowledgement } from './Acknowledgement'
import { ErrorSummary, type SummaryItem } from './ErrorSummary'
import styles from './forms.module.css'
import { TurnstileWidget } from './TurnstileWidget'

/**
 * A public form (docs/17 §6): the Team Map request or the partnership enquiry, in the kit's
 * form markup (src/brand/gallery.html, "Form"). It works without JavaScript: the form posts to
 * its page (`permalink`, with the form's id), the server answers with the form's next state and
 * the page is drawn with it. With JavaScript the same answer comes back in place. Either way an
 * answer to check brings the error summary, each message beside its field and what was typed;
 * a sent form is replaced by its acknowledgement, which takes focus.
 *
 * The browser checks nothing (`noValidate`): every answer is checked on the server, so the
 * summary and the messages are the same with and without a script. The consent box is never
 * ticked for the person (CLAUDE.md #9), and its words are the notice in force.
 */

const fieldId = (kind: EnquiryFormKind, name: string) => `${FORM_COPY[kind].idPrefix}-${name}`
const errorId = (id: string) => `${id}-error`
const helpId = (id: string) => `${id}-help`

/** The ids an input is described by: its help, then its error. */
function describedBy(id: string, help: boolean, error: boolean): string | undefined {
  const ids = [help ? helpId(id) : null, error ? errorId(id) : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function Field({
  kind,
  field,
  value,
  error,
}: {
  kind: EnquiryFormKind
  field: FormField
  value: string | undefined
  error: string | undefined
}) {
  const id = fieldId(kind, field.name)
  const shared = {
    id,
    name: field.name,
    className: 'iiic-field',
    required: field.required,
    defaultValue: value ?? '',
    autoComplete: field.autoComplete,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy(id, Boolean(field.help), Boolean(error)),
  }
  let input
  if (field.type === 'textarea') {
    input = <textarea {...shared} rows={4} />
  } else if (field.type === 'select') {
    input = (
      <select {...shared}>
        <option value="">{CHOOSE}</option>
        {TEAM_SIZE_BANDS.map((band) => (
          <option key={band.value} value={band.value}>
            {band.label}
          </option>
        ))}
      </select>
    )
  } else {
    input = (
      <input
        {...shared}
        type={field.type}
        inputMode={field.type === 'tel' ? 'tel' : undefined}
        spellCheck={field.type === 'email' || field.type === 'url' ? false : undefined}
        autoCapitalize={field.type === 'email' || field.type === 'url' ? 'none' : undefined}
      />
    )
  }
  return (
    <div className={`iiic-field-wrap${field.full ? ' full' : ''}`}>
      <label className="iiic-label" htmlFor={id}>
        {field.label}
      </label>
      {input}
      {field.help ? (
        <div className="iiic-help" id={helpId(id)}>
          {field.help}
        </div>
      ) : null}
      {error ? (
        <div className="iiic-error" id={errorId(id)}>
          {error}
        </div>
      ) : null}
    </div>
  )
}

/** The box for `enquiryReplies`: unticked unless the person ticked it, beside the notice's words. */
function Consent({
  kind,
  notice,
  ticked,
  error,
}: {
  kind: EnquiryFormKind
  notice: NoticeShown
  ticked: boolean
  error: string | undefined
}) {
  const id = fieldId(kind, 'consent')
  return (
    <div className="full">
      <label className="iiic-check" htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name="consent"
          value="yes"
          required
          defaultChecked={ticked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId(id) : undefined}
        />
        <span className={styles.notice}>{notice.text}</span>
      </label>
      {error ? (
        <div className="iiic-error" id={errorId(id)}>
          {error}
        </div>
      ) : null}
      <p className="iiic-help">
        <Link className="iiic-link" href={PRIVACY_NOTICE.href}>
          {PRIVACY_NOTICE.label}
        </Link>
      </p>
    </div>
  )
}

/** The summary of what to check, in the order the form asks, the consent box last. */
function summaryItems(kind: EnquiryFormKind, state: EnquiryFormState): SummaryItem[] {
  const names = [...FORM_COPY[kind].fields.map((field) => field.name), 'consent']
  return names.flatMap((name) => {
    const message = state.errors[name]
    return message ? [{ id: fieldId(kind, name), message }] : []
  })
}

function Summary({ kind, state }: { kind: EnquiryFormKind; state: EnquiryFormState }) {
  if (state.status === 'refused' && state.refusal) {
    return <ErrorSummary heading={NOT_SENT} text={REFUSALS[state.refusal]} />
  }
  if (state.status !== 'invalid') return null
  const items = summaryItems(kind, state)
  return items.length > 0 ? (
    <ErrorSummary heading={checkAnswers(items.length)} items={items} />
  ) : null
}

export function EnquiryForm({
  kind,
  setup,
  notice: shown,
}: {
  kind: EnquiryFormKind
  /** What the page read for the form, with its server action. */
  setup: FormSetup
  /** The consent text in force as the page was drawn; the form is drawn only while there is one. */
  notice: NoticeShown
}) {
  const copy = FORM_COPY[kind]
  const [state, formAction, pending] = useActionState(
    setup.action,
    INITIAL_FORM_STATE,
    `${setup.page}#${copy.anchor}`,
  )
  if (state.status === 'received') return <Acknowledgement kind={kind} key={state.attempt} />
  // A notice that changed after the page was drawn is the one to read and tick now.
  const notice = state.notice ?? shown
  return (
    <>
      <div className={styles.summary}>
        <Summary kind={kind} state={state} key={state.attempt} />
      </div>
      <form
        // Drawn again after each answer, with what was typed, and a fresh spam check.
        key={state.attempt}
        className="iiic-form-grid"
        action={formAction}
        noValidate
        aria-label={copy.heading}
        onSubmit={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        {copy.fields.map((field) => (
          <Field
            kind={kind}
            field={field}
            value={state.values[field.name]}
            error={state.errors[field.name]}
            key={field.name}
          />
        ))}
        <Consent
          kind={kind}
          notice={notice}
          ticked={state.values.consent === 'yes'}
          error={state.errors.consent}
        />
        <input type="hidden" name={HIDDEN.drawn} value={setup.drawn} />
        <input type="hidden" name={HIDDEN.page} value={setup.page} />
        <input type="hidden" name={HIDDEN.noticeVersion} value={notice.version} />
        {UTM_KEYS.map((key) =>
          state.utm[key] ? (
            <input type="hidden" name={`utm_${key}`} value={state.utm[key]} key={key} />
          ) : null,
        )}
        {/* The trap: hidden from people and from screen readers, and out of the tab order. */}
        <div className="iiic-sr-only" aria-hidden="true">
          <label htmlFor={fieldId(kind, HIDDEN.trap)}>{TRAP_LABEL}</label>
          <input
            type="text"
            id={fieldId(kind, HIDDEN.trap)}
            name={HIDDEN.trap}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        {setup.turnstileSiteKey ? (
          <TurnstileWidget siteKey={setup.turnstileSiteKey} action={copy.anchor} />
        ) : null}
        <div className="full iiic-row">
          <button
            className={`iiic-btn iiic-btn-primary${pending ? ' is-loading' : ''}`}
            type="submit"
            aria-disabled={pending ? true : undefined}
            aria-busy={pending ? true : undefined}
          >
            {copy.submit}
          </button>
        </div>
      </form>
    </>
  )
}
