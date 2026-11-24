/**
 * What an error report may carry (docs/12 §7: no request bodies, no user context beyond role;
 * docs/08 §9: scrubbed of personal data). Every event passes through here before it leaves the
 * server, whatever put the data on it.
 */
type Reported = {
  user?: unknown
  request?: { url?: string; method?: string }
  breadcrumbs?: unknown
  extra?: unknown
  message?: string
  exception?: {
    values?: { value?: string; stacktrace?: { frames?: { vars?: unknown }[] } }[]
  }
  // The request's name: its method and path (Sentry has already cut the query).
  transaction?: string
  // Next.js's onRequestError puts the request's path in contexts.nextjs.request_path.
  contexts?: Record<string, Record<string, unknown> | undefined>
}

// A failed database query lists the values it was given after "params:".
const QUERY_VALUES = /\bparams:[\s\S]*$/i
// An address as typed, or percent-encoded in a URL (%40 for @). A match starts only where a run
// of the characters an address is made of starts: tried from every character of a long run, the
// pattern takes time in the square of the run's length. Addresses written back to back
// (a@b.in+c@d.in) make one match, so the second is not passed over.
const EMAIL = /(?<![\w.+%-])(?:[\w.+%-]+(?:@|%40)[\w-]+(?:\.[\w-]+)+)+/g
// In a URL a plus is written %2B (or %2b) and a space %20. A number can follow a percent-encoded
// character (?text=Call%20on%209876543210), where \b finds no boundary after the 0 of %20.
const PLUS = String.raw`(?:\+|%2B)`
const GAP = String.raw`(?:[\s-]|%20)`
const START = String.raw`(?:(?<!\w)|(?<=%[\dA-F]{2}))`
// E.164 numbers; Indian mobile numbers with +91, 91 or 0 in front or nothing, with or without
// spaces or dashes (+91 98765 43210, 919876543210, 098765-43210, 9876543210); typed or encoded.
const PHONE = new RegExp(
  [
    String.raw`${PLUS}\d{8,15}\b`,
    String.raw`(?:${PLUS}91${GAP}?|${START}(?:91${GAP}?|0)?)[6-9]\d{4}${GAP}?\d{5}\b`,
  ].join('|'),
  'gi',
)
// Long random strings: session tokens, reset links, keys.
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g
// The addresses whose last part is a key or a booking's reference, however short: a certificate's
// verify link (a 22-character token, docs/18 §4; `/verify` on the institute host), a booking's
// manage link and payment pages (docs/16 §6), a proposal's tracked link (docs/17 §5), a
// practitioner's private calendar feed (a 22-character token, docs/16 §7), and the messages' own
// links: the one-tap withdrawal and the newsletter's confirmation and unsubscribe (docs/19 §8).
const KEY_PATH =
  /(\/(?:institute\/)?verify|\/b|\/p|\/w|\/newsletter\/(?:confirm|unsubscribe)|\/book\/(?:pay|confirmed)|\/api\/calendar\/feed)\/[A-Za-z0-9_-]{8,}/gi

/** An error message without the personal data and secrets a library may have put in it. */
export function scrubText(text: string): string {
  return text
    .replace(KEY_PATH, (_match, prefix: string) => `${prefix}/[token]`)
    .replace(QUERY_VALUES, 'params: [removed]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[phone]')
    .replace(TOKEN, '[token]')
}

/** A URL's path only: its query string and fragment can hold tokens, and so can a path segment. */
function pathOnly(url: string): string {
  try {
    return scrubText(new URL(url, 'https://site.invalid').pathname)
  } catch {
    return '[url]'
  }
}

/**
 * The event with the person taken out: no user, no cookies, headers or body, no trail of earlier
 * actions (it can hold queries and addresses), no local variable values, and messages and paths
 * cleaned. The role and the collection travel as tags, set where the error is reported.
 */
export function scrubEvent<T extends Reported>(event: T): T {
  const scrubbed: Reported = { ...event }
  delete scrubbed.user
  delete scrubbed.breadcrumbs
  delete scrubbed.extra
  if (event.request) {
    scrubbed.request = {
      method: event.request.method,
      url: event.request.url === undefined ? undefined : pathOnly(event.request.url),
    }
  }
  // A path can hold a token (/admin/reset/<token>): in the request's name, and in the path
  // Next.js reports with a render error.
  if (typeof event.transaction === 'string') scrubbed.transaction = scrubText(event.transaction)
  const nextjs = event.contexts?.nextjs
  if (typeof nextjs?.request_path === 'string') {
    scrubbed.contexts = {
      ...event.contexts,
      nextjs: { ...nextjs, request_path: pathOnly(nextjs.request_path) },
    }
  }
  if (typeof event.message === 'string') scrubbed.message = scrubText(event.message)
  if (event.exception?.values) {
    scrubbed.exception = {
      ...event.exception,
      values: event.exception.values.map((entry) => ({
        ...entry,
        ...(typeof entry.value === 'string' ? { value: scrubText(entry.value) } : {}),
        ...(entry.stacktrace?.frames
          ? {
              stacktrace: {
                ...entry.stacktrace,
                frames: entry.stacktrace.frames.map(({ vars: _vars, ...frame }) => frame),
              },
            }
          : {}),
      })),
    }
  }
  return scrubbed as T
}
