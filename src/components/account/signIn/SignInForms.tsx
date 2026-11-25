'use client'

import { type FormEvent, useActionState, useEffect } from 'react'

import { ErrorSummary, type SummaryItem } from '@/components/forms/ErrorSummary'
import { TurnstileWidget } from '@/components/forms/TurnstileWidget'
import { Todo } from '@/components/Todo'
import {
  checkCode,
  createMyAccount,
  declineAccount,
  sendCode,
  sendNewCode,
} from '@/lib/accounts/signIn/actions'
import { ACCOUNT_COPY, LOGIN_COPY, VERIFY_COPY } from '@/lib/accounts/signIn/copy'
import {
  FIELD_IDS,
  INITIAL_SIGN_IN_STATE,
  type SignInFormState,
} from '@/lib/accounts/signIn/formState'

import styles from './signIn.module.css'

/**
 * The sign-in forms (docs/20 §4.1), in the kit's form markup (src/brand/gallery.html, "Form").
 * Each posts to a server action and works without JavaScript: the page is drawn again with the
 * answer (the action's permalink), or the server redirects to the next step. With JavaScript the
 * same answer comes back in place. The browser checks nothing (`noValidate`), so the messages
 * are the server's either way. An answer to check brings the kit's error summary, which takes
 * focus, linked to its field, and the message beside the field. No box is ever ticked for the
 * person (CLAUDE.md #9).
 */

const errorId = (id: string) => `${id}-error`
const helpId = (id: string) => `${id}-help`

const describedBy = (id: string, help: boolean, error: boolean) =>
  [help ? helpId(id) : null, error ? errorId(id) : null].filter(Boolean).join(' ') || undefined

/** The summary of what went wrong: a field's message, linked to it, or the reason alone. */
function Summary({
  state,
  heading,
  order,
}: {
  state: SignInFormState
  heading: { field: string; refusal: string }
  order: readonly string[]
}) {
  const items: SummaryItem[] = order.flatMap((id) =>
    state.errors[id] ? [{ id, message: state.errors[id] as string }] : [],
  )
  if (items.length === 0 && !state.refusal) return null
  return (
    <ErrorSummary
      key={state.attempt}
      heading={items.length ? heading.field : heading.refusal}
      items={items}
      {...(state.refusal ? { text: state.refusal } : {})}
    />
  )
}

/** A text field with its label, help and message. */
function Field({
  id,
  name,
  label,
  help,
  error,
  defaultValue,
  type,
  autoComplete,
  inputMode,
}: {
  id: string
  name: string
  label: string
  help?: string
  error?: string
  defaultValue?: string
  type: 'email' | 'tel' | 'text'
  autoComplete: string
  inputMode?: 'email' | 'tel' | 'numeric' | 'text'
}) {
  return (
    <div className="iiic-field-wrap">
      <label className="iiic-label" htmlFor={id}>
        {label}
      </label>
      <input
        className="iiic-field"
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        spellCheck={type === 'email' ? false : undefined}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(help), Boolean(error))}
      />
      {help ? (
        <div className="iiic-help" id={helpId(id)}>
          {help}
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

/** An unticked box with its words beside it, and its message. */
function Check({
  id,
  name,
  label,
  help,
  error,
}: {
  id: string
  name: string
  label: string
  help?: string
  error?: string
}) {
  return (
    <div className={styles.check}>
      <label className="iiic-check" htmlFor={id}>
        <input
          type="checkbox"
          id={id}
          name={name}
          value="yes"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, Boolean(help), Boolean(error))}
        />
        <span>{label}</span>
      </label>
      {help ? (
        <div className="iiic-help" id={helpId(id)}>
          {help}
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

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      className={`iiic-btn iiic-btn-primary${pending ? ' is-loading' : ''}`}
      type="submit"
      aria-disabled={pending ? true : undefined}
      aria-busy={pending ? true : undefined}
    >
      {children}
    </button>
  )
}

const blockWhilePending = (pending: boolean) => (event: FormEvent) => {
  if (pending) event.preventDefault()
}

// ---- Step 1 · the address ----

export function AddressForm({
  channel,
  turnstileSiteKey,
  next,
}: {
  channel: 'email' | 'whatsapp'
  turnstileSiteKey: string | null
  next?: string
}) {
  const [state, action, pending] = useActionState(sendCode, INITIAL_SIGN_IN_STATE, '/login')
  const email = channel === 'email'
  const id = email ? FIELD_IDS.email : FIELD_IDS.mobile
  return (
    <>
      <Summary
        state={state}
        heading={{ field: LOGIN_COPY.check, refusal: LOGIN_COPY.summary }}
        order={[id]}
      />
      <form
        key={state.attempt}
        className={styles.form}
        action={action}
        noValidate
        aria-label={email ? LOGIN_COPY.emailButton : LOGIN_COPY.mobileButton}
        onSubmit={blockWhilePending(pending)}
      >
        <input type="hidden" name="channel" value={channel} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field
          id={id}
          name="identifier"
          label={email ? LOGIN_COPY.emailLabel : LOGIN_COPY.mobileLabel}
          help={email ? LOGIN_COPY.emailHelp : LOGIN_COPY.mobileHelp}
          error={state.errors[id]}
          defaultValue={state.values[id]}
          type={email ? 'email' : 'tel'}
          autoComplete={email ? 'email' : 'tel'}
          inputMode={email ? 'email' : 'tel'}
        />
        {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} action="sign-in" /> : null}
        <div className="iiic-row">
          <SubmitButton pending={pending}>
            {email ? LOGIN_COPY.emailButton : LOGIN_COPY.mobileButton}
          </SubmitButton>
        </div>
      </form>
    </>
  )
}

// ---- Step 2 · the code ----

function CodeField({ id, error }: { id: string; error?: string }) {
  return (
    <Field
      id={id}
      name="code"
      label={VERIFY_COPY.codeLabel}
      error={error}
      type="text"
      autoComplete="one-time-code"
      inputMode="numeric"
    />
  )
}

export function CodeForm() {
  const [state, action, pending] = useActionState(checkCode, INITIAL_SIGN_IN_STATE, '/login/verify')
  return (
    <>
      <Summary
        state={state}
        heading={{ field: VERIFY_COPY.summary, refusal: VERIFY_COPY.summary }}
        order={[FIELD_IDS.code]}
      />
      <form
        key={state.attempt}
        className={styles.form}
        action={action}
        noValidate
        aria-label={VERIFY_COPY.heading}
        onSubmit={blockWhilePending(pending)}
      >
        <CodeField id={FIELD_IDS.code} error={state.errors[FIELD_IDS.code]} />
        <Check
          id="verify-trust"
          name="trust"
          label={VERIFY_COPY.trust}
          help={VERIFY_COPY.trustHelp}
        />
        <div className="iiic-row">
          <SubmitButton pending={pending}>{VERIFY_COPY.submit}</SubmitButton>
        </div>
      </form>
    </>
  )
}

/** Moves focus to a status line when it appears, so a screen reader reads it first. */
function FocusStatus({ id, attempt }: { id: string; attempt: number }) {
  useEffect(() => {
    if (attempt > 0) document.getElementById(id)?.focus()
  }, [id, attempt])
  return null
}

export function NewCodeForm() {
  const [state, action, pending] = useActionState(
    sendNewCode,
    INITIAL_SIGN_IN_STATE,
    '/login/verify',
  )
  const statusId = 'verify-resent'
  return (
    <form action={action} className={styles.secondary} onSubmit={blockWhilePending(pending)}>
      {state.info ? (
        <>
          <div className="iiic-alert iiic-alert-green" role="status" tabIndex={-1} id={statusId}>
            {state.info}
          </div>
          <FocusStatus id={statusId} attempt={state.attempt} />
        </>
      ) : null}
      {state.refusal ? (
        <>
          <div className="iiic-alert iiic-alert-yellow" role="status" tabIndex={-1} id={statusId}>
            {state.refusal}
          </div>
          <FocusStatus id={statusId} attempt={state.attempt} />
        </>
      ) : null}
      <button
        className="iiic-btn iiic-btn-outline"
        type="submit"
        aria-disabled={pending ? true : undefined}
        aria-busy={pending ? true : undefined}
      >
        {VERIFY_COPY.resend}
      </button>
    </form>
  )
}

// ---- Step 3 · the account (a new address only) ----

export function AccountForm({
  suggestedName,
  notice,
}: {
  suggestedName: string | null
  /** The account notice in force as the page was drawn; null while there is none (I-65). */
  notice: { id: number; text: string } | null
}) {
  const [state, action, pending] = useActionState(
    createMyAccount,
    INITIAL_SIGN_IN_STATE,
    '/login/verify',
  )
  // A notice that changed after the page was drawn is the one to read and tick now.
  const shown = state.notice ?? notice
  const order = [FIELD_IDS.fullName, FIELD_IDS.consent, FIELD_IDS.adult]
  return (
    <>
      <Summary
        state={state}
        heading={{ field: ACCOUNT_COPY.summary, refusal: ACCOUNT_COPY.summary }}
        order={order}
      />
      <form
        key={state.attempt}
        className={styles.form}
        action={action}
        noValidate
        aria-label={ACCOUNT_COPY.heading}
        onSubmit={blockWhilePending(pending)}
      >
        <Field
          id={FIELD_IDS.fullName}
          name="fullName"
          label={ACCOUNT_COPY.nameLabel}
          help={ACCOUNT_COPY.nameHelp}
          error={state.errors[FIELD_IDS.fullName]}
          defaultValue={state.values[FIELD_IDS.fullName] ?? suggestedName ?? ''}
          type="text"
          autoComplete="name"
        />
        {shown ? (
          <>
            <input type="hidden" name="noticeVersionId" value={shown.id} />
            <Check
              id={FIELD_IDS.consent}
              name="consent"
              label={shown.text}
              error={state.errors[FIELD_IDS.consent]}
            />
          </>
        ) : (
          <p className={styles.notice}>
            <Todo what="the account notice and consent text" id="I-65" />
          </p>
        )}
        <Check
          id={FIELD_IDS.adult}
          name="adult"
          label={ACCOUNT_COPY.adult}
          error={state.errors[FIELD_IDS.adult]}
        />
        <div className="iiic-row">
          {shown ? <SubmitButton pending={pending}>{ACCOUNT_COPY.create}</SubmitButton> : null}
          {/* Equal weight: the same size as the button beside it, and no less plain. */}
          <button className="iiic-btn iiic-btn-secondary" type="submit" formAction={declineAccount}>
            {ACCOUNT_COPY.decline}
          </button>
        </div>
      </form>
    </>
  )
}
