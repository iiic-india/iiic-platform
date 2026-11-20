// Any origin of our own would do: only paths are kept, so a `back` that names a host never
// matches it, whatever the deployment's real origin is.
const BASE = 'https://admin.invalid'

/**
 * Where the two-factor views send someone once their code is accepted (payload-totp passes the
 * page they were on as `?back=`). It comes from the query string, so anyone can put it in a
 * link: it is kept only as a path inside the admin, over HTTP(S), without credentials; a host,
 * a protocol-relative or backslash path (`//evil.example`, `/\evil.example`), `javascript:` and
 * anything outside the admin all land on the admin's home. Checked on the server, so the
 * browser only ever receives the result.
 */
export function safeBack(back: unknown, adminRoute: string): string {
  const home = adminRoute || '/'
  if (typeof back !== 'string' || back === '') return home
  let url: URL
  try {
    url = new URL(back, BASE)
  } catch {
    return home
  }
  if (url.origin !== BASE || url.username || url.password) return home
  const base = home.endsWith('/') ? home : `${home}/`
  const inAdmin = home === '/' || url.pathname === home || url.pathname.startsWith(base)
  return inAdmin ? `${url.pathname}${url.search}${url.hash}` : home
}
