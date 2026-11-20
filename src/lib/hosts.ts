/**
 * Host-based routing (docs/02, docs/12 §1). One app serves the platform domain and, from
 * Release 3, the institute domain `iiic.edu.in`. Until then the institute's pages live under
 * /institute on the platform, so a request on an institute host is served from /institute.
 * INSTITUTE_HOSTS is empty until ERNET approves the domain, and nothing changes before then.
 */
export function parseHosts(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
}

/**
 * The path to serve instead, when the request arrived on an institute host; otherwise null.
 * The admin answers only on the platform host: on an institute host it resolves under
 * /institute and finds nothing. API routes are outside the proxy and are not rewritten.
 */
export function instituteRewrite(
  host: string | null,
  pathname: string,
  instituteHosts: Set<string>,
): string | null {
  if (!host || !instituteHosts.has(host.toLowerCase())) return null
  if (pathname === '/institute' || pathname.startsWith('/institute/')) return null
  return pathname === '/' ? '/institute' : `/institute${pathname}`
}
