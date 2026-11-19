/**
 * The Content-Security-Policy for every HTML response (docs/12 §5, D-42), built per request
 * by src/proxy.ts with a fresh nonce. Next.js adds that nonce to its own scripts while it
 * renders, so scripts run only when they carry it; 'strict-dynamic' lets them load the chunks
 * they import. Styles may be inline: Payload's admin injects <style> tags at runtime
 * (react-select through Emotion) and React renders style attributes; inline styles cannot
 * run code. Third-party origins join with the features that need them: Cloudflare's beacon
 * and Turnstile (M2), Sentry (M1, through a same-origin tunnel), Razorpay on the payment
 * step only (M3).
 */
export type CspOptions = {
  nonce: string
  /** `next dev` needs eval for React's debugging features; never in a build. */
  development: boolean
  /**
   * Only over HTTPS. On plain http (local and CI) upgrade-insecure-requests would rewrite the
   * page's own requests to https, which nothing serves.
   */
  https: boolean
}

export function buildCsp({ nonce, development, https }: CspOptions): string {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'"],
    ['frame-src', "'none'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  if (https) directives.push(['upgrade-insecure-requests'])
  return directives.map((directive) => directive.join(' ')).join('; ')
}

/** 128 random bits, base64: a new value for every response. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}
