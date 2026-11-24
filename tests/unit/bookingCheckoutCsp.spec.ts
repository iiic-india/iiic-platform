// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { registerOfReference, typeOfReference } from '@/components/booking/registers'
import { checkoutSources, isPaymentStep } from '@/lib/security/checkout'
import { buildCsp } from '@/lib/security/csp'

// The payment step's third parties (docs/12 §5): Razorpay's origins on /book/pay/[ref] only,
// and only where the deployment uses Razorpay.

const frameSrc = (csp: string) =>
  csp
    .split('; ')
    .find((directive) => directive.startsWith('frame-src'))
    ?.split(' ')
    .slice(1)

describe('the payment step’s policy', () => {
  it('names Razorpay only on the payment step, and only with the real gateway', () => {
    expect(isPaymentStep('/book/pay/IIIC-S-12345')).toBe(true)
    expect(isPaymentStep('/book/session')).toBe(false)
    expect(isPaymentStep('/book/pay/../admin')).toBe(false)
    expect(checkoutSources('/book/session', 'razorpay').scriptOrigins).toEqual([])
    expect(checkoutSources('/book/pay/IIIC-S-12345', 'fake').scriptOrigins).toEqual([])
    expect(checkoutSources('/book/pay/IIIC-S-12345', 'razorpay').scriptOrigins).toEqual([
      'https://checkout.razorpay.com',
    ])
  })

  it('frames the checkout instead of nothing, and nothing elsewhere', () => {
    const plain = buildCsp({ nonce: 'n', development: false, https: true })
    expect(frameSrc(plain)).toEqual(["'none'"])
    const pay = buildCsp({
      nonce: 'n',
      development: false,
      https: true,
      frameOrigins: checkoutSources('/book/pay/IIIC-S-12345', 'razorpay').frameOrigins,
    })
    expect(frameSrc(pay)).toEqual(['https://api.razorpay.com', 'https://checkout.razorpay.com'])
  })
})

describe('a booking’s register', () => {
  it('comes from the letter in its reference', () => {
    expect(typeOfReference('IIIC-S-00001')).toBe('session')
    expect(registerOfReference('IIIC-S-00001')).toBe('counselling')
    expect(registerOfReference('IIIC-C-00001')).toBe('consultancy')
    expect(registerOfReference('IIIC-I-00001')).toBe('education')
    expect(registerOfReference('not-a-reference')).toBeUndefined()
  })
})
