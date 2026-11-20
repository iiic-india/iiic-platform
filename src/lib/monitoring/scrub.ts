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
}

// A failed database query lists the values it was given after "params:".
const QUERY_VALUES = /\bparams:[\s\S]*$/i
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
// E.164 numbers, and bare ten-digit Indian mobile numbers.
const PHONE = /\+\d{8,15}\b|\b[6-9]\d{9}\b/g
// Long random strings: session tokens, reset links, keys.
const TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g

/** An error message without the personal data and secrets a library may have put in it. */
export function scrubText(text: string): string {
  return text
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
 * actions (it can hold queries and addresses), no local variable values, and messages cleaned.
 * The role and the collection travel as tags, set where the error is reported.
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
