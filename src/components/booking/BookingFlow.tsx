'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { TurnstileWidget } from '@/components/forms/TurnstileWidget'
import { listTimesAction, submitBookingAction } from '@/lib/bookingFlow/actions'
import type { FlowCatalogue, FlowOption, FlowService } from '@/lib/bookingFlow/catalogue'
import { dayLong, whenOf } from '@/lib/bookingFlow/format'
import { consentsOffered, suggestEmail, type FlowType } from '@/lib/bookingFlow/options'
import { formatRate, formatRupees, reviewFor } from '@/lib/bookingFlow/review'

import { errorMessage, FLOW_COPY, STEP_NAMES } from './copy'
import { ErrorSummary } from './ErrorSummary'
import { Stepper } from './Stepper'
import { TimePicker, type SlotDays } from './TimePicker'

type Step = 'choose' | 'when' | 'details'
type FieldError = { field: string; message: string }

/** The id of a field's input, for its label, its error and the error summary's link. */
const idFor = (field: string) => `book-${field.replace(/\./g, '-')}`

function Field({
  name,
  label,
  help,
  error,
  type = 'text',
  autoComplete,
  inputMode,
  required = false,
  defaultValue,
  onBlur,
  maxLength,
}: {
  name: string
  label: string
  help?: string
  error?: string
  type?: string
  autoComplete?: string
  inputMode?: 'tel' | 'email' | 'text'
  required?: boolean
  defaultValue?: string
  onBlur?: (value: string) => void
  maxLength?: number
}) {
  const id = idFor(name)
  const described = [help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className="iiic-field-wrap full">
      <label className="iiic-label" htmlFor={id}>
        {label}
        {required ? null : ` ${FLOW_COPY.optional}`}
      </label>
      <input
        className="iiic-field"
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        onBlur={onBlur ? (event) => onBlur(event.currentTarget.value) : undefined}
      />
      {help ? (
        <div className="iiic-help" id={`${id}-help`}>
          {help}
        </div>
      ) : null}
      {error ? (
        <div className="iiic-error" id={`${id}-error`}>
          {error}
        </div>
      ) : null}
    </div>
  )
}

/** The next 14 days in India, for a time request's preferred days. */
function requestDays(today: string): string[] {
  const days: string[] = []
  const start = new Date(`${today}T12:00:00+05:30`)
  for (let offset = 0; offset < 14; offset += 1) {
    const next = new Date(start.getTime() + offset * 86_400_000)
    days.push(next.toISOString().slice(0, 10))
  }
  return days
}

/**
 * The booking flow (docs/03 F3): choose, when, details with the review, then payment or the
 * confirmation, which are pages of their own. Plain and accessible first (docs/16 §12): each step
 * has a heading that takes the focus when the step opens; the choices, days and times are radio
 * groups; a failed submit shows the kit's error summary, focused, with links to the fields. Every
 * rule is the server's: what is offered, what is free, what it costs and what is booked.
 */
export function BookingFlow({
  type,
  catalogue,
  checkoutKey,
  today,
  turnstileSiteKey = null,
}: {
  type: FlowType
  catalogue: FlowCatalogue
  checkoutKey: string
  today: string
  /** Turnstile's site key where both its keys are set (src/lib/bookingFlow/guards.ts). */
  turnstileSiteKey?: string | null
}) {
  const router = useRouter()
  const isInfo = type === 'info'
  const [step, setStep] = useState<Step>('choose')
  const [serviceId, setServiceId] = useState<number | null>(catalogue.services[0]?.id ?? null)
  const service: FlowService | null =
    catalogue.services.find((entry) => entry.id === serviceId) ?? null
  const [optionId, setOptionId] = useState<string | null>(service?.options[0]?.id ?? null)
  const option: FlowOption | null = service?.options.find((entry) => entry.id === optionId) ?? null
  const [format, setFormat] = useState<'online' | 'office' | null>(null)
  const [practitionerId, setPractitionerId] = useState<number | null>(
    service?.practitioners[0]?.id ?? null,
  )
  const [eventId, setEventId] = useState<number | null>(
    catalogue.events.find((event) => !event.full)?.id ?? null,
  )
  const event = catalogue.events.find((entry) => entry.id === eventId) ?? null

  const [days, setDays] = useState<SlotDays | null>(null)
  const [timesProblem, setTimesProblem] = useState<string | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [preferredTimes, setPreferredTimes] = useState('')
  const [note, setNote] = useState('')

  const [ageBand, setAgeBand] = useState<string | null>(null)
  const [whoFor, setWhoFor] = useState<string | null>(null)
  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldError[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // A Turnstile token is good for one check: the widget is drawn again after each refusal.
  const [attempt, setAttempt] = useState(0)

  const heading = useRef<HTMLHeadingElement>(null)
  // The new step's heading takes the focus; the first step's does not, on arrival.
  const shownStep = useRef<Step>(step)
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    heading.current?.focus()
  }, [step])

  const review = reviewFor({ type, flags: catalogue.flags, quote: option?.total ?? null })
  const steps = [
    STEP_NAMES.choose,
    ...(isInfo ? [] : [STEP_NAMES.when]),
    STEP_NAMES.details,
    ...(review.pay && !asking ? [STEP_NAMES.pay] : []),
    STEP_NAMES.done,
  ]
  const current = step === 'choose' ? 0 : step === 'when' ? 1 : isInfo ? 1 : 2
  const consentTexts = consentsOffered(type, null)
    .map((purpose) => catalogue.consents.find((entry) => entry.purpose === purpose))
    .filter((entry) => entry !== undefined)
  const bookingConsent = catalogue.consents.some(
    (entry) => entry.purpose === 'bookingCommunications',
  )
  const nothing = isInfo ? catalogue.events.length === 0 : catalogue.services.length === 0

  async function loadTimes() {
    if (!service || !option || !practitionerId) return
    setDays(null)
    setTimesProblem(null)
    setDay(null)
    setStartsAt(null)
    const answer = await listTimesAction({
      serviceId: service.id,
      serviceOption: option.id,
      practitionerId,
    })
    if (answer.ok) {
      setDays(answer.value.days)
      setDay(answer.value.days[0]?.day ?? null)
      if (!answer.value.days.length) setTimesProblem(FLOW_COPY.noTimes)
    } else {
      setDays([])
      setTimesProblem(
        answer.error.code === 'rule-missing' ? FLOW_COPY.rulesMissing : FLOW_COPY.noTimes,
      )
    }
  }

  function continueFromChoose() {
    setProblem(null)
    if (isInfo) {
      setStep('details')
      return
    }
    setAsking(false)
    setStep('when')
    void loadTimes()
  }

  function continueFromWhen() {
    if (asking ? preferredDays.length === 0 : !startsAt) {
      setProblem(asking ? FLOW_COPY.chooseDays : FLOW_COPY.chooseTime)
      return
    }
    setProblem(null)
    setStep('details')
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (sending) return
    const form = new FormData(formEvent.currentTarget)
    const read = (name: string) => {
      const value = form.get(name)
      return typeof value === 'string' ? value : undefined
    }
    const details: Record<string, unknown> = {
      fullName: read('fullName') ?? '',
      mobile: read('mobile') ?? '',
      email: read('email') ?? '',
      consents: {
        bookingCommunications: read('consents.bookingCommunications'),
        marketingEmail: read('consents.marketingEmail'),
        marketingWhatsapp: read('consents.marketingWhatsapp'),
      },
    }
    if (type === 'session') {
      details.whoFor = read('whoFor')
      details.ageBand = read('ageBand')
      details.guardian = read('guardian')
    }
    if (type === 'call') {
      details.company = read('company') ?? ''
      details.role = read('role')
      details.teamSize = read('teamSize')
      details.sector = read('sector')
    }
    const chosenFormat = service?.format === 'both' ? (format ?? undefined) : undefined
    const choice = isInfo
      ? { kind: 'event' as const, eventId: eventId as number }
      : asking
        ? {
            kind: 'request' as const,
            serviceId: service?.id as number,
            serviceOption: option?.id as string,
            practitionerId: practitionerId ?? undefined,
            preferredDays,
            preferredTimes: preferredTimes || undefined,
            note: note || undefined,
            format: chosenFormat,
          }
        : {
            kind: 'slot' as const,
            serviceId: service?.id as number,
            serviceOption: option?.id as string,
            practitionerId: practitionerId as number,
            startsAt: startsAt as string,
            format: chosenFormat,
            shownTotalPaise: option?.total?.totalPaise ?? null,
          }
    setSending(true)
    setProblem(null)
    const turnstileToken = turnstileSiteKey ? read('cf-turnstile-response') : undefined
    try {
      const answer = await submitBookingAction({
        type,
        checkoutKey,
        choice,
        details,
        ...(turnstileToken ? { turnstileToken } : {}),
      })
      if (answer.ok) {
        router.push(
          answer.value.next === 'pay'
            ? `/book/pay/${answer.value.ref}`
            : `/book/confirmed/${answer.value.ref}`,
        )
        return
      }
      if (answer.error.code === 'invalid-input' && answer.error.fields.length) {
        setErrors(answer.error.fields)
      } else {
        setErrors([])
        setProblem(errorMessage(answer.error.code))
      }
    } catch {
      setProblem(errorMessage('failed'))
    }
    setAttempt((count) => count + 1)
    setSending(false)
  }

  const errorOf = (field: string) => errors.find((error) => error.field === field)?.message
  const where: 'online' | 'office' | null = isInfo
    ? (event?.format ?? null)
    : service?.format === 'both'
      ? format
      : (service?.format ?? null)
  const chooseReady = isInfo
    ? Boolean(event && !event.full)
    : Boolean(service && option && practitionerId && (service.format !== 'both' || format !== null))

  if (nothing) {
    return (
      <section className="iiic-section">
        <div className="iiic-empty">
          <p>{FLOW_COPY.nothingToBook[type]}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="iiic-section">
      <Stepper steps={steps} current={current} />
      <p className="iiic-type-small">{FLOW_COPY.stepOf(current + 1, steps.length)}</p>

      {problem ? (
        <div className="iiic-alert iiic-alert-yellow" role="alert">
          {problem}
        </div>
      ) : null}

      {step === 'choose' ? (
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {FLOW_COPY.chooseHeading[type]}
          </h2>
          {isInfo ? (
            <fieldset className="iiic-fieldset">
              <legend>{FLOW_COPY.serviceLegend.info}</legend>
              <div className="iiic-choices">
                {catalogue.events.map((entry) => (
                  <label className="iiic-choice" key={entry.id}>
                    <input
                      type="radio"
                      name="event"
                      value={entry.id}
                      checked={entry.id === eventId}
                      disabled={entry.full}
                      onChange={() => setEventId(entry.id)}
                    />
                    <span className="iiic-choice-body">
                      <strong>{entry.title}</strong>
                      <small>
                        {whenOf(entry.startsAt)} · {FLOW_COPY.formats[entry.format]}
                      </small>
                    </span>
                    <span className="iiic-choice-meta">
                      {entry.full ? FLOW_COPY.full : FLOW_COPY.free}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <>
              {catalogue.services.length > 1 ? (
                <fieldset className="iiic-fieldset">
                  <legend>{FLOW_COPY.serviceLegend[type]}</legend>
                  <div className="iiic-choices">
                    {catalogue.services.map((entry) => (
                      <label className="iiic-choice" key={entry.id}>
                        <input
                          type="radio"
                          name="service"
                          value={entry.id}
                          checked={entry.id === serviceId}
                          onChange={() => {
                            setServiceId(entry.id)
                            setOptionId(entry.options[0]?.id ?? null)
                            setPractitionerId(entry.practitioners[0]?.id ?? null)
                            setFormat(null)
                          }}
                        />
                        <span className="iiic-choice-body">
                          <strong>{entry.name}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {service ? (
                <fieldset className="iiic-fieldset">
                  <legend>{FLOW_COPY.lengthLegend}</legend>
                  <div className="iiic-choices">
                    {service.options.map((entry) => (
                      <label className="iiic-choice" key={entry.id}>
                        <input
                          type="radio"
                          name="option"
                          value={entry.id}
                          checked={entry.id === optionId}
                          onChange={() => setOptionId(entry.id)}
                        />
                        <span className="iiic-choice-body">
                          <strong>{entry.label ?? service.name}</strong>
                          <small>{FLOW_COPY.minutes(entry.minutes)}</small>
                        </span>
                        {entry.total ? (
                          <span className="iiic-choice-meta">
                            {formatRupees(entry.total.totalPaise)}
                          </span>
                        ) : type === 'call' ? (
                          <span className="iiic-choice-meta">{FLOW_COPY.free}</span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                  {option?.total ? <p className="iiic-help">{FLOW_COPY.totalNote}</p> : null}
                </fieldset>
              ) : null}
              {service?.format === 'both' ? (
                <fieldset className="iiic-fieldset">
                  <legend>{FLOW_COPY.formatLegend}</legend>
                  <div className="iiic-choices">
                    {(['online', 'office'] as const).map((value) => (
                      <label className="iiic-choice" key={value}>
                        <input
                          type="radio"
                          name="format"
                          value={value}
                          checked={format === value}
                          onChange={() => setFormat(value)}
                        />
                        <span className="iiic-choice-body">
                          <strong>{FLOW_COPY.formats[value]}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {service && service.practitioners.length > 1 ? (
                <fieldset className="iiic-fieldset">
                  <legend>{FLOW_COPY.practitionerLegend}</legend>
                  <div className="iiic-choices">
                    {service.practitioners.map((entry) => (
                      <label className="iiic-choice" key={entry.id}>
                        <input
                          type="radio"
                          name="practitioner"
                          value={entry.id}
                          checked={entry.id === practitionerId}
                          onChange={() => setPractitionerId(entry.id)}
                        />
                        <span className="iiic-choice-body">
                          <strong>{entry.name}</strong>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          )}
          <div className="iiic-row">
            <button
              className="iiic-btn iiic-btn-primary"
              type="button"
              disabled={!chooseReady}
              onClick={continueFromChoose}
            >
              {FLOW_COPY.next}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'when' ? (
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {asking ? FLOW_COPY.requestHeading : FLOW_COPY.whenHeading}
          </h2>
          {asking ? (
            <>
              <p>{FLOW_COPY.requestHelp}</p>
              <fieldset className="iiic-fieldset">
                <legend>{FLOW_COPY.preferredDaysLegend}</legend>
                <div className="iiic-choices">
                  {requestDays(today).map((entry) => (
                    <label className="iiic-check" key={entry}>
                      <input
                        type="checkbox"
                        value={entry}
                        checked={preferredDays.includes(entry)}
                        onChange={(change) =>
                          setPreferredDays((list) =>
                            change.currentTarget.checked
                              ? [...list, entry].sort()
                              : list.filter((value) => value !== entry),
                          )
                        }
                      />
                      <span>{dayLong(entry)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="iiic-form-grid">
                <div className="iiic-field-wrap full">
                  <label className="iiic-label" htmlFor="book-preferredTimes">
                    {FLOW_COPY.preferredTimesLabel} {FLOW_COPY.optional}
                  </label>
                  <input
                    className="iiic-field"
                    id="book-preferredTimes"
                    maxLength={200}
                    value={preferredTimes}
                    aria-describedby="book-preferredTimes-help"
                    onChange={(change) => setPreferredTimes(change.currentTarget.value)}
                  />
                  <div className="iiic-help" id="book-preferredTimes-help">
                    {FLOW_COPY.preferredTimesHelp}
                  </div>
                </div>
                <div className="iiic-field-wrap full">
                  <label className="iiic-label" htmlFor="book-note">
                    {FLOW_COPY.noteLabel} {FLOW_COPY.optional}
                  </label>
                  <textarea
                    className="iiic-field"
                    id="book-note"
                    rows={3}
                    maxLength={1000}
                    value={note}
                    aria-describedby="book-note-help"
                    onChange={(change) => setNote(change.currentTarget.value)}
                  />
                  <div className="iiic-help" id="book-note-help">
                    {FLOW_COPY.noteHelp}
                  </div>
                </div>
              </div>
            </>
          ) : days === null ? (
            <p className="iiic-skeleton" role="status">
              {FLOW_COPY.loadingTimes}
            </p>
          ) : (
            <>
              {timesProblem ? <p role="status">{timesProblem}</p> : null}
              {days.length ? (
                <TimePicker
                  days={days}
                  day={day}
                  startsAt={startsAt}
                  onDay={(value) => {
                    setDay(value)
                    setStartsAt(null)
                  }}
                  onTime={setStartsAt}
                />
              ) : null}
            </>
          )}
          <div className="iiic-row">
            <button
              className="iiic-btn iiic-btn-secondary"
              type="button"
              onClick={() => setStep('choose')}
            >
              {FLOW_COPY.back}
            </button>
            <button
              className="iiic-btn iiic-btn-outline"
              type="button"
              onClick={() => {
                setProblem(null)
                setAsking((value) => !value)
              }}
            >
              {asking ? FLOW_COPY.pickTimeInstead : FLOW_COPY.requestToggle}
            </button>
            <button className="iiic-btn iiic-btn-primary" type="button" onClick={continueFromWhen}>
              {FLOW_COPY.next}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'details' ? (
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {FLOW_COPY.detailsHeading}
          </h2>
          <ErrorSummary errors={errors} idFor={idFor} />
          {!bookingConsent ? (
            <div className="iiic-alert iiic-alert-yellow" role="status">
              {FLOW_COPY.consentMissing}
            </div>
          ) : null}
          <form className="iiic-form-grid" noValidate onSubmit={submit}>
            <Field
              name="fullName"
              label={FLOW_COPY.fullName}
              autoComplete="name"
              required
              maxLength={200}
              error={errorOf('fullName')}
            />
            <Field
              name="mobile"
              label={FLOW_COPY.mobile}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              maxLength={30}
              help={FLOW_COPY.mobileHelp}
              error={errorOf('mobile')}
            />
            <Field
              name="email"
              label={type === 'call' ? FLOW_COPY.workEmail : FLOW_COPY.email}
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              help={FLOW_COPY.emailHelp}
              error={errorOf('email')}
              onBlur={(value) => setEmailHint(suggestEmail(value.trim()))}
            />
            {emailHint ? (
              <p className="iiic-help full" role="status">
                {FLOW_COPY.didYouMean(emailHint)}{' '}
                <button
                  className="iiic-btn iiic-btn-outline"
                  type="button"
                  onClick={() => {
                    const field = document.getElementById(idFor('email')) as HTMLInputElement | null
                    if (field) field.value = emailHint
                    setEmailHint(null)
                    field?.focus()
                  }}
                >
                  {FLOW_COPY.useSuggestion}
                </button>
              </p>
            ) : null}

            {type === 'session' ? (
              <>
                <fieldset className="iiic-fieldset full" id={idFor('whoFor')}>
                  <legend>{FLOW_COPY.whoForLegend}</legend>
                  {(['yourself', 'family'] as const).map((value) => (
                    <label className="iiic-check" key={value}>
                      <input
                        type="radio"
                        name="whoFor"
                        value={value}
                        onChange={() => setWhoFor(value)}
                      />
                      <span>{FLOW_COPY.whoFor[value]}</span>
                    </label>
                  ))}
                  {errorOf('whoFor') ? <div className="iiic-error">{errorOf('whoFor')}</div> : null}
                </fieldset>
                <fieldset className="iiic-fieldset full" id={idFor('ageBand')}>
                  <legend>{FLOW_COPY.ageBandLegend}</legend>
                  {(['adult', 'under18'] as const).map((value) => (
                    <label className="iiic-check" key={value}>
                      <input
                        type="radio"
                        name="ageBand"
                        value={value}
                        onChange={() => setAgeBand(value)}
                      />
                      <span>{FLOW_COPY.ageBands[value]}</span>
                    </label>
                  ))}
                  {errorOf('ageBand') ? (
                    <div className="iiic-error">{errorOf('ageBand')}</div>
                  ) : null}
                </fieldset>
                {ageBand === 'under18' && whoFor === 'family' ? (
                  <div className="iiic-field-wrap full">
                    <label className="iiic-check">
                      <input
                        type="checkbox"
                        name="guardian"
                        id={idFor('guardian')}
                        aria-describedby={`${idFor('guardian')}-help`}
                      />
                      <span>{FLOW_COPY.guardian}</span>
                    </label>
                    <div className="iiic-help" id={`${idFor('guardian')}-help`}>
                      {FLOW_COPY.guardianHelp}
                    </div>
                    {errorOf('guardian') ? (
                      <div className="iiic-error">{errorOf('guardian')}</div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {type === 'call' ? (
              <>
                <Field
                  name="company"
                  label={FLOW_COPY.company}
                  autoComplete="organization"
                  required
                  maxLength={200}
                  error={errorOf('company')}
                />
                <Field
                  name="role"
                  label={FLOW_COPY.role}
                  autoComplete="organization-title"
                  maxLength={100}
                />
                <Field name="teamSize" label={FLOW_COPY.teamSize} maxLength={50} />
                <Field name="sector" label={FLOW_COPY.sector} maxLength={100} />
              </>
            ) : null}

            <fieldset className="iiic-fieldset full">
              <legend>{FLOW_COPY.consentsLegend}</legend>
              <p className="iiic-help">{FLOW_COPY.consentsHelp}</p>
              {consentTexts.map((entry) => {
                if (ageBand === 'under18' && entry.purpose !== 'bookingCommunications') return null
                const field = `consents.${entry.purpose}`
                return (
                  <div key={entry.purpose}>
                    <label className="iiic-check">
                      <input
                        type="checkbox"
                        name={field}
                        id={idFor(field)}
                        aria-invalid={errorOf(field) ? true : undefined}
                      />
                      <span>{entry.text}</span>
                    </label>
                    {errorOf(field) ? <div className="iiic-error">{errorOf(field)}</div> : null}
                  </div>
                )
              })}
            </fieldset>

            <div className="iiic-panel full">
              <h3>{FLOW_COPY.reviewHeading}</h3>
              <dl>
                <dt>{FLOW_COPY.reviewWhat}</dt>
                <dd>
                  {isInfo
                    ? event?.title
                    : `${service?.name ?? ''}${option ? `, ${FLOW_COPY.minutes(option.minutes)}` : ''}`}
                </dd>
                <dt>{FLOW_COPY.reviewWhen}</dt>
                <dd>
                  {isInfo && event
                    ? whenOf(event.startsAt)
                    : asking
                      ? FLOW_COPY.reviewRequest
                      : startsAt
                        ? whenOf(startsAt)
                        : null}
                </dd>
                {where ? (
                  <>
                    <dt>{FLOW_COPY.reviewWhere}</dt>
                    <dd>{FLOW_COPY.formats[where]}</dd>
                  </>
                ) : null}
                {!isInfo && service ? (
                  <>
                    <dt>{FLOW_COPY.reviewWith}</dt>
                    <dd>
                      {service.practitioners.find((entry) => entry.id === practitionerId)?.name}
                    </dd>
                  </>
                ) : null}
                {review.total ? (
                  <>
                    <dt>{FLOW_COPY.reviewTotal}</dt>
                    <dd>
                      <strong>{formatRupees(review.total.totalPaise)}</strong>
                      <br />
                      <span className="iiic-type-small">
                        {FLOW_COPY.reviewTax(
                          formatRupees(review.total.taxPaise),
                          formatRate(review.total.rate),
                        )}
                      </span>
                    </dd>
                  </>
                ) : null}
              </dl>
              <p className="iiic-type-small">
                {review.pay && !asking ? FLOW_COPY.payAfter : FLOW_COPY.noPaymentNow}
              </p>
            </div>

            {turnstileSiteKey ? (
              <TurnstileWidget
                key={attempt}
                siteKey={turnstileSiteKey}
                action={`booking-${type}`}
              />
            ) : null}

            <div className="full iiic-row">
              <button
                className="iiic-btn iiic-btn-secondary"
                type="button"
                onClick={() => setStep(isInfo ? 'choose' : 'when')}
              >
                {FLOW_COPY.back}
              </button>
              <button
                className={`iiic-btn iiic-btn-primary${sending ? ' is-loading' : ''}`}
                type="submit"
                aria-busy={sending || undefined}
                aria-disabled={sending || !bookingConsent || undefined}
                disabled={!bookingConsent}
              >
                {sending
                  ? FLOW_COPY.submitting
                  : asking
                    ? FLOW_COPY.submit.request
                    : review.pay
                      ? FLOW_COPY.submit.pay
                      : FLOW_COPY.submit.confirm}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
