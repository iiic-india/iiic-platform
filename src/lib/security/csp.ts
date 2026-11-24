/**
 * The Content-Security-Policy for every HTML response (docs/12 §5, D-42), built per request
 * by src/proxy.ts with a fresh nonce. Next.js adds that nonce to its own scripts while it
 * renders, so scripts run only when they carry it; 'strict-dynamic' lets them load the chunks
 * they import. Styles may be inline: Payload's admin injects <style> tags at runtime
 * (react-select through Emotion) and React renders style attributes; inline styles cannot
 * run code. Third-party origins join with the features that need them: Cloudflare's beacon
 * (M2, only where its token is set: src/lib/analytics/beacon.ts), Turnstile (M4, on public pages
 * only where both its keys are set: src/lib/enquiryForms/turnstile.ts), Razorpay on the payment
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
  /** Where public images are served from besides this site: the R2 media bucket. */
  imageOrigins?: readonly string[]
  /**
   * Scripts from another origin, and where they send what they measure: Cloudflare's beacon
   * (docs/12 §5, §7). Under 'strict-dynamic' a browser runs a script only by its nonce; the
   * origin is there for browsers that predate it.
   */
  scriptOrigins?: readonly string[]
  connectOrigins?: readonly string[]
  /**
   * Who may frame this response: nobody, except a draft-mode response for staff signed in with
   * their two-factor code, which the admin's live preview frames (src/lib/preview/frame.ts).
   */
  frameAncestors?: "'self'" | "'none'"
  /** What this page may frame: nothing, except the admin, whose live preview frames the site. */
  frameSources?: "'self'" | "'none'"
  /**
   * Other origins this page may frame: the gateway's checkout, on the payment step only; and
   * Turnstile's check, which draws itself in a frame, on public pages where its keys are set.
   */
  frameOrigins?: readonly string[]
}

export function buildCsp({
  nonce,
  development,
  https,
  imageOrigins = [],
  scriptOrigins = [],
  connectOrigins = [],
  frameAncestors = "'none'",
  frameSources = "'none'",
  frameOrigins = [],
}: CspOptions): string {
  // 'none' stands alone: with an origin to frame, it gives way to that origin.
  const frames: [string, ...string[]] =
    frameOrigins.length === 0
      ? [frameSources]
      : ([...(frameSources === "'self'" ? ["'self'"] : []), ...frameOrigins] as [
          string,
          ...string[],
        ])
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...scriptOrigins,
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:', ...imageOrigins],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...connectOrigins],
    ['frame-src', ...frames],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', frameAncestors],
  ]
  if (https) directives.push(['upgrade-insecure-requests'])
  return directives.map((directive) => directive.join(' ')).join('; ')
}

/** The nonce in a policy, as the proxy hands it to the page (the request's CSP header). */
export function nonceFrom(csp: string | null | undefined): string | undefined {
  return csp?.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1]
}

/** 128 random bits, base64: a new value for every response. */
export function createNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}
