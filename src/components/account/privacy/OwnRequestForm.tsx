'use client'

import { useActionState } from 'react'

import { ErrorSummary, type SummaryItem } from '@/components/forms/ErrorSummary'
import { createRequestAction } from '@/lib/accounts/privacy/actions'
import { REQUEST_COPY } from '@/lib/accounts/privacy/copy'
import { INITIAL_REQUEST_STATE } from '@/lib/accounts/privacy/state'

import { SignInAgain } from './SignInAgain'

const TYPE_ID = 'own-request-type'
const SUMMARY_ID = 'own-request-summary'

/**
 * A request about one's data (docs/20 §7.5), in the kit's form markup. It works without
 * JavaScript: the form posts to the page, which is drawn with the answer; with JavaScript the
 * answer comes back in place. An answer to check brings the error summary, each message beside
 * its field and the words typed; a refusal says why and keeps them; a request taken leads back
 * to the page, which says it was sent. The browser checks nothing (`noValidate`).
 *
 * The kinds, the limit and the page's address come from the server, so the browser loads none
 * of the contract's schemas.
 */
export function OwnRequestForm({
  types,
  maxLength,
  permalink,
}: {
  types: readonly { value: string; label: string }[]
  maxLength: number
  permalink: string
}) {
  const [state, formAction, pending] = useActionState(
    createRequestAction,
    INITIAL_REQUEST_STATE,
    permalink,
  )
  const items: SummaryItem[] = [
    ...(state.errors.type ? [{ id: TYPE_ID, message: state.errors.type }] : []),
    ...(state.errors.summary ? [{ id: SUMMARY_ID, message: state.errors.summary }] : []),
  ]
  return (
    <>
      {state.status === 'invalid' && items.length > 0 ? (
        <ErrorSummary
          key={state.key}
          heading={
            items.length === 1 ? REQUEST_COPY.checkOne : REQUEST_COPY.checkMany(items.length)
          }
          items={items}
        />
      ) : null}
      {state.status === 'refused' && state.refusal ? (
        <>
          <ErrorSummary key={state.key} heading={REQUEST_COPY.notSent} text={state.refusal} />
          {state.signInAgain ? <SignInAgain back="requests" /> : null}
        </>
      ) : null}
      <form
        action={formAction}
        className="iiic-form-grid"
        aria-labelledby="requests-heading"
        noValidate
      >
        <div className="iiic-field-wrap full">
          <label className="iiic-label" htmlFor={TYPE_ID}>
            {REQUEST_COPY.type}
          </label>
          <select
            className="iiic-field"
            id={TYPE_ID}
            name="type"
            defaultValue={state.values.type}
            key={`type-${state.key}`}
            aria-invalid={state.errors.type ? true : undefined}
            aria-describedby={state.errors.type ? `${TYPE_ID}-error` : undefined}
          >
            <option value="">{REQUEST_COPY.choose}</option>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          {state.errors.type ? (
            <div className="iiic-error" id={`${TYPE_ID}-error`}>
              {state.errors.type}
            </div>
          ) : null}
        </div>
        <div className="iiic-field-wrap full">
          <label className="iiic-label" htmlFor={SUMMARY_ID}>
            {REQUEST_COPY.summary}
          </label>
          <textarea
            className="iiic-field"
            id={SUMMARY_ID}
            name="summary"
            rows={5}
            maxLength={maxLength}
            defaultValue={state.values.summary}
            key={`summary-${state.key}`}
            aria-invalid={state.errors.summary ? true : undefined}
            aria-describedby={[
              `${SUMMARY_ID}-help`,
              state.errors.summary ? `${SUMMARY_ID}-error` : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          <div className="iiic-help" id={`${SUMMARY_ID}-help`}>
            {REQUEST_COPY.summaryHelp}
          </div>
          {state.errors.summary ? (
            <div className="iiic-error" id={`${SUMMARY_ID}-error`}>
              {state.errors.summary}
            </div>
          ) : null}
        </div>
        <div className="full iiic-row">
          <button
            className={`iiic-btn iiic-btn-primary${pending ? ' is-loading' : ''}`}
            type="submit"
            aria-disabled={pending ? true : undefined}
          >
            {REQUEST_COPY.button}
          </button>
        </div>
      </form>
    </>
  )
}
