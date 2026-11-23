/**
 * The payment step's third parties (docs/12 §2, §5; docs/08 §9): Razorpay's hosted checkout is
 * allowed on /book/pay/[ref] and nowhere else, and only where this deployment uses Razorpay (the
 * fake gateway of local development and CI loads nothing). Its script comes from
 * checkout.razorpay.com and opens its form in a frame from api.razorpay.com, which reports to
 * lumberjack.razorpay.com. The list is checked against Razorpay's checkout documentation each
 * release, as docs/12 §5 asks; the browser's own CSP report names anything missing.
 */
export const RAZORPAY_CHECKOUT = {
  scriptOrigins: ['https://checkout.razorpay.com'],
  frameOrigins: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  connectOrigins: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
  imageOrigins: ['https://cdn.razorpay.com'],
} as const

/** Whether a path is the payment step: /book/pay/ and a booking reference. */
export function isPaymentStep(pathname: string): boolean {
  return /^\/book\/pay\/IIIC-[SCI]-\d{5}\/?$/.test(pathname)
}

export type CheckoutSources = {
  scriptOrigins: string[]
  frameOrigins: string[]
  connectOrigins: string[]
  imageOrigins: string[]
}

/** The origins the payment step adds to the page's policy; none anywhere else. */
export function checkoutSources(pathname: string, gateway: 'razorpay' | 'fake'): CheckoutSources {
  if (gateway !== 'razorpay' || !isPaymentStep(pathname)) {
    return { scriptOrigins: [], frameOrigins: [], connectOrigins: [], imageOrigins: [] }
  }
  return {
    scriptOrigins: [...RAZORPAY_CHECKOUT.scriptOrigins],
    frameOrigins: [...RAZORPAY_CHECKOUT.frameOrigins],
    connectOrigins: [...RAZORPAY_CHECKOUT.connectOrigins],
    imageOrigins: [...RAZORPAY_CHECKOUT.imageOrigins],
  }
}
