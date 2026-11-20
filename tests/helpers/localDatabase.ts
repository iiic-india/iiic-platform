const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Tests create obviously fake staff whose passwords and two-factor secrets are in this
 * repository, so they only ever run against a database on this machine or CI's own container.
 * Preview and Production share one database for now (docs/07): an interrupted run there would
 * leave a working owner account behind. The URL is never printed, because it holds a password.
 */
export function assertLocalDatabase(url = process.env.DATABASE_URL): void {
  let host = ''
  try {
    host = new URL(url ?? '').hostname
  } catch {
    // Not a URL: refused below.
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      'These tests write staff accounts, so they run only against a local database. Point DATABASE_URL at localhost (docker compose up -d).',
    )
  }
}
