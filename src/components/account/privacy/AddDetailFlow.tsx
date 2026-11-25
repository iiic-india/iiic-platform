'use client'

import Link from 'next/link'
import { useActionState, useEffect, useRef } from 'react'

import { ErrorSummary } from '@/components/forms/ErrorSummary'
import type { SignInChannel } from '@/lib/accounts/contract'
import { confirmDetailAction, requestDetailAction } from '@/lib/accounts/privacy/actions'
import { DETAIL_COPY } from '@/lib/accounts/privacy/copy'
import { INITIAL_CONFIRM_STATE, initialDetailState } from '@/lib/accounts/privacy/state'

const FIELD_ID = 'detail-identifier'
const CODE_ID = 'detail-code'

/**
 * Adding the contact detail an account lacks (docs/20 §4.6): the address or number, then the
 * six-digit code sent to it, with builder A's machinery behind both steps. It works without
 * JavaScript: each form posts to this page, which is drawn with its answer. An answer to check
 * brings the error summary and the message beside the field; the code step's heading takes the
 * focus when it opens; a right code leads back to the privacy page, which says it was added.
 * The code field takes a pasted or autofilled code (`one-time-code`), and nothing on the page
 * counts down (docs/20 §4.1).
 */
export function AddDetailFlow({
  channel,
  permalink,
  back,
}: {
  channel: SignInChannel
  permalink: string
  back: string
}) {
  const copy = DETAIL_COPY[channel]
  const [asked, ask, asking] = useActionState(
    requestDetailAction,
    initialDetailState(channel),
    permalink,
  )
  const [checked, check, checking] = useActionState(
    confirmDetailAction,
    INITIAL_CONFIRM_STATE,
    permalink,
  )
  const codeStep = asked.status === 'sent' || checked.status !== 'idle'
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (asked.status === 'sent') heading.current?.focus()
  }, [asked.status, asked.key])

  if (!codeStep) {
    const invalid = asked.status === 'invalid' && asked.error
    return (
      <>
        {invalid ? (
          <ErrorSummary
            key={asked.key}
            heading={DETAIL_COPY.checkOne}
            items={[{ id: FIELD_ID, message: asked.error as string }]}
          />
        ) : null}
        {asked.status === 'refused' && asked.error ? (
          <ErrorSummary key={asked.key} heading={DETAIL_COPY.notDone} text={asked.error} />
        ) : null}
        <form action={ask} className="iiic-form-grid" noValidate>
          <input type="hidden" name="channel" value={channel} />
          <div className="iiic-field-wrap full">
            <label className="iiic-label" htmlFor={FIELD_ID}>
              {copy.label}
            </label>
            <input
              className="iiic-field"
              id={FIELD_ID}
              name="identifier"
              type={channel === 'email' ? 'email' : 'tel'}
              inputMode={channel === 'email' ? 'email' : 'tel'}
              autoComplete={channel === 'email' ? 'email' : 'tel'}
              spellCheck={false}
              autoCapitalize="none"
              defaultValue={asked.value}
              key={`identifier-${asked.key}`}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={[`${FIELD_ID}-help`, invalid ? `${FIELD_ID}-error` : '']
                .filter(Boolean)
                .join(' ')}
            />
            <div className="iiic-help" id={`${FIELD_ID}-help`}>
              {copy.help}
            </div>
            {invalid ? (
              <div className="iiic-error" id={`${FIELD_ID}-error`}>
                {asked.error}
              </div>
            ) : null}
          </div>
          <div className="full iiic-row">
            <button
              className={`iiic-btn iiic-btn-primary${asking ? ' is-loading' : ''}`}
              type="submit"
              aria-disabled={asking ? true : undefined}
            >
              {DETAIL_COPY.send}
            </button>
            <Link className="iiic-btn iiic-btn-secondary" href={back}>
              {DETAIL_COPY.back}
            </Link>
          </div>
        </form>
      </>
    )
  }

  const invalid = checked.status === 'invalid' && checked.error
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        {DETAIL_COPY.codeHeading}
      </h2>
      {invalid ? (
        <ErrorSummary
          key={checked.key}
          heading={DETAIL_COPY.checkOne}
          items={[{ id: CODE_ID, message: checked.error as string }]}
        />
      ) : null}
      {checked.status === 'refused' && checked.error ? (
        <ErrorSummary key={checked.key} heading={DETAIL_COPY.notDone} text={checked.error} />
      ) : null}
      {asked.masked ? <p>{DETAIL_COPY.sentTo(asked.masked)}</p> : null}
      <form action={check} className="iiic-form-grid" noValidate>
        <div className="iiic-field-wrap full">
          <label className="iiic-label" htmlFor={CODE_ID}>
            {DETAIL_COPY.code}
          </label>
          <input
            className="iiic-field iiic-otp"
            id={CODE_ID}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            key={`code-${checked.key}`}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? `${CODE_ID}-error` : undefined}
          />
          {invalid ? (
            <div className="iiic-error" id={`${CODE_ID}-error`}>
              {checked.error}
            </div>
          ) : null}
        </div>
        <div className="full iiic-row">
          <button
            className={`iiic-btn iiic-btn-primary${checking ? ' is-loading' : ''}`}
            type="submit"
            aria-disabled={checking ? true : undefined}
          >
            {DETAIL_COPY.confirm}
          </button>
        </div>
      </form>
      <div className="iiic-row">
        {asked.value ? (
          <form action={ask}>
            <input type="hidden" name="channel" value={channel} />
            <input type="hidden" name="identifier" value={asked.value} />
            <button className="iiic-btn iiic-btn-outline" type="submit">
              {DETAIL_COPY.resend}
            </button>
          </form>
        ) : null}
        <a className="iiic-link" href={permalink}>
          {copy.different}
        </a>
      </div>
    </>
  )
}
