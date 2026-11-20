import * as Sentry from '@sentry/nextjs'

/** Runs once when a server instance starts: error reporting (src/lib/monitoring/sentry.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startMonitoring } = await import('@/lib/monitoring/sentry')
    startMonitoring()
  }
}

/**
 * Errors Next.js catches while it renders a page or runs a route handler. Payload's own API
 * errors are reported through its afterError hook (src/payload.config.ts).
 */
export const onRequestError = Sentry.captureRequestError
