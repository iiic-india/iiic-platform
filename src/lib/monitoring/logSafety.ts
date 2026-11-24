import { scrubText } from './scrub'

/**
 * What an error may put in the server's logs (docs/12 §6: never a body, a note, an answer, a full
 * phone number or email; CLAUDE.md, Logs). Payload logs every error that leaves an endpoint or a
 * REST operation as `{ err }`, and a failed database query's error carries the values it was
 * given in its message (after "params:"), in its stack's first line and in properties of its own
 * and of its cause (Postgres's `detail` names the duplicate value). This keeps a known set of
 * fields only: the error's name, a code or status, its message with the values and anything that
 * looks like an email, a phone number or a token cut out, the stack's frames without its message,
 * and the same for its cause, two levels deep. Nothing else on the error is written.
 */

export type LoggedError = {
  type: string
  message: string
  code?: string | number
  status?: number
  stack?: string
  cause?: LoggedError
}

const MAX_DEPTH = 2

export function logSafeError(value: unknown, depth = 0): LoggedError {
  if (typeof value !== 'object' || value === null) {
    return { type: typeof value, message: scrubText(String(value)) }
  }
  const error = value as {
    name?: unknown
    message?: unknown
    code?: unknown
    status?: unknown
    stack?: unknown
    cause?: unknown
  }
  const frames =
    typeof error.stack === 'string'
      ? error.stack
          .split('\n')
          .filter((line) => /^\s+at /.test(line))
          .join('\n')
      : ''
  return {
    type: typeof error.name === 'string' ? error.name : 'Error',
    message: typeof error.message === 'string' ? scrubText(error.message) : '',
    ...(typeof error.code === 'string' || typeof error.code === 'number'
      ? { code: error.code }
      : {}),
    ...(typeof error.status === 'number' ? { status: error.status } : {}),
    ...(frames ? { stack: frames } : {}),
    ...(error.cause !== undefined && depth < MAX_DEPTH
      ? { cause: logSafeError(error.cause, depth + 1) }
      : {}),
  }
}

/**
 * Payload's logger with that rule (src/payload.config.ts): structured JSON, as docs/12 §6 asks,
 * with every `err` passed through `logSafeError`.
 */
export const LOGGER_OPTIONS = {
  serializers: { err: logSafeError, error: logSafeError },
} as const
