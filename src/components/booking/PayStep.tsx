'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  bookingStateAction,
  checkoutReturnedAction,
  fakePayAction,
  openCheckoutAction,
  type BookingState,
} from '@/lib/bookingFlow/actions'
import { formatCountdown, holdSecondsLeft } from '@/lib/bookingFlow/review'

import { PAY_COPY } from './copy'

type Phase = 'ready' | 'opening' | 'fake' | 'waiting' | 'failed' | 'down' | 'expired' | 'lost'

/** Razorpay's hosted checkout, as its script puts it on the window. */
type RazorpayCheckout = new (options: Record<string, unknown>) => { open: () => void }

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

function loadCheckout(): Promise<RazorpayCheckout | null> {
  const ready = (window as { Razorpay?: RazorpayCheckout }).Razorpay
  if (ready) return Promise.resolve(ready)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT
    script.async = true
    script.onload = () => resolve((window as { Razorpay?: RazorpayCheckout }).Razorpay ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

/**
 * Step 4, payment at booking (docs/03 F3; docs/16 §5). The time is held until the end the server
 * set, and the timer counts to it and never resets (docs/08 §5); the total was shown before this
 * step and does not change. Paying opens the gateway's hosted checkout (Razorpay, or the fake
 * gateway's test buttons where this deployment has no real one); whatever the browser hears
 * back confirms nothing: the page asks the server, which waits for the gateway's signed webhook
 * or checks the order itself, and moves on once the booking is confirmed.
 */
export function PayStep({
  reference,
  holdExpiresAt: initialHoldEnd,
  amount,
  startAgainHref,
  paymentOpened = false,
}: {
  reference: string
  holdExpiresAt: string | null
  amount: string | null
  startAgainHref: string
  /** Whether a checkout was opened already: a payment may then arrive after the hold. */
  paymentOpened?: boolean
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('ready')
  const [holdEnd, setHoldEnd] = useState(initialHoldEnd)
  const [left, setLeft] = useState(() => holdSecondsLeft(initialHoldEnd, new Date()))
  const [checkoutOpened, setCheckoutOpened] = useState(paymentOpened)
  const polling = useRef(false)
  const message = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setLeft(holdSecondsLeft(holdEnd, new Date())), 1000)
    return () => window.clearInterval(timer)
  }, [holdEnd])

  // A screen reader hears the hold once more, not every second: in its last minute; its end is
  // the expiry alert.
  const announce = left > 0 && left <= 60 ? PAY_COPY.lastMinute : ''
  // A hold that has run out ends the chance to pay, whatever the page was showing.
  const shown: Phase =
    left === 0 && (phase === 'ready' || phase === 'failed' || phase === 'down') ? 'expired' : phase

  const settle = useCallback(
    (state: BookingState): boolean => {
      if (state.paymentOpened) setCheckoutOpened(true)
      if (state.status === 'confirmed') {
        router.replace(`/book/confirmed/${reference}`)
        return true
      }
      if (state.slotLost) {
        setPhase('lost')
        return true
      }
      if (state.status === 'expired' || state.status === 'cancelledByClient') {
        setPhase('expired')
        return true
      }
      return false
    },
    [reference, router],
  )

  const poll = useCallback(
    async (afterAttempt: boolean) => {
      if (polling.current) return
      polling.current = true
      setPhase('waiting')
      for (let attempt = 0; attempt < 90; attempt += 1) {
        const answer = await bookingStateAction({ ref: reference })
        if (answer.ok) {
          if (settle(answer.value)) break
          if (afterAttempt && answer.value.lastAttemptFailed) {
            setPhase('failed')
            break
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000))
      }
      polling.current = false
    },
    [reference, settle],
  )

  // The message that replaces the pay button takes the focus, so the person hears it.
  useEffect(() => {
    if (shown !== 'ready' && shown !== 'opening' && shown !== 'fake') message.current?.focus()
  }, [shown])

  async function pay() {
    setPhase('opening')
    const opened = await openCheckoutAction({ ref: reference })
    if (!opened.ok) {
      if (opened.error.code === 'gateway-down') {
        setHoldEnd(opened.error.holdExpiresAt)
        setPhase('down')
      } else if (opened.error.code === 'hold-expired') setPhase('expired')
      else setPhase('failed')
      return
    }
    setCheckoutOpened(true)
    if (opened.value.fake) {
      setPhase('fake')
      return
    }
    const Checkout = await loadCheckout()
    if (!Checkout) {
      setPhase('down')
      return
    }
    const checkout = new Checkout({
      key: opened.value.keyId,
      order_id: opened.value.orderId,
      name: 'IIIC',
      description: reference,
      handler: async (response: {
        razorpay_order_id: string
        razorpay_payment_id: string
        razorpay_signature: string
      }) => {
        setPhase('waiting')
        const answer = await checkoutReturnedAction({
          ref: reference,
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        })
        if (answer.ok && settle(answer.value)) return
        void poll(false)
      },
      modal: { ondismiss: () => void poll(true) },
    })
    checkout.open()
  }

  async function testPay(outcome: 'captured' | 'failed') {
    setPhase('waiting')
    await fakePayAction({ ref: reference, outcome })
    void poll(true)
  }

  const canPay = left > 0 && (shown === 'ready' || shown === 'failed' || shown === 'down')

  return (
    <div className="iiic-panel">
      <p role="timer" aria-live="off">
        {left > 0 ? PAY_COPY.held(formatCountdown(left)) : null}
      </p>
      <p className="iiic-sr-only" aria-live="polite">
        {announce}
      </p>
      <p className="iiic-type-small">{PAY_COPY.heldHelp}</p>
      {amount ? (
        <dl>
          <dt>{PAY_COPY.total}</dt>
          <dd>
            <strong>{amount}</strong>
          </dd>
        </dl>
      ) : null}

      <div ref={message} tabIndex={-1}>
        {shown === 'waiting' ? <p role="status">{PAY_COPY.waiting}</p> : null}
        {shown === 'opening' ? <p role="status">{PAY_COPY.opening}</p> : null}
        {shown === 'failed' ? (
          <div className="iiic-alert iiic-alert-yellow" role="alert">
            {PAY_COPY.failed}
          </div>
        ) : null}
        {shown === 'down' ? (
          <div className="iiic-alert iiic-alert-yellow" role="alert">
            {PAY_COPY.gatewayDown}
          </div>
        ) : null}
        {shown === 'expired' && checkoutOpened ? (
          <div className="iiic-alert iiic-alert-yellow" role="alert">
            <p>{PAY_COPY.expiredMayPay}</p>
          </div>
        ) : null}
        {shown === 'expired' && !checkoutOpened ? (
          <div className="iiic-alert iiic-alert-yellow" role="alert">
            <p>{PAY_COPY.expired}</p>
            <a className="iiic-btn iiic-btn-primary" href={startAgainHref}>
              {PAY_COPY.startAgain}
            </a>
          </div>
        ) : null}
        {shown === 'lost' ? (
          <div className="iiic-alert iiic-alert-yellow" role="alert">
            <p>{PAY_COPY.slotLost}</p>
            <a className="iiic-btn iiic-btn-primary" href={startAgainHref}>
              {PAY_COPY.startAgain}
            </a>
          </div>
        ) : null}
      </div>

      {canPay ? (
        <div className="iiic-row">
          <button className="iiic-btn iiic-btn-primary" type="button" onClick={pay}>
            {shown === 'ready' ? PAY_COPY.pay(amount ?? '') : PAY_COPY.tryAgain}
          </button>
        </div>
      ) : null}

      {shown === 'fake' ? (
        <fieldset className="iiic-fieldset">
          <legend>{PAY_COPY.testGateway}</legend>
          <div className="iiic-row">
            <button
              className="iiic-btn iiic-btn-primary"
              type="button"
              onClick={() => testPay('captured')}
            >
              {PAY_COPY.testPay}
            </button>
            <button
              className="iiic-btn iiic-btn-secondary"
              type="button"
              onClick={() => testPay('failed')}
            >
              {PAY_COPY.testFail}
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  )
}
