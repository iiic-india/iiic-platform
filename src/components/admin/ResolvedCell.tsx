import type { DefaultCellComponentProps } from 'payload'

import { REDIRECTS_COPY as COPY } from './redirectsCopy'

/**
 * The 404 log's "Redirect" column: whether a redirect sends the address on yet, in words. A server
 * component: Payload renders a custom cell on the server, and this one has no state or handler.
 */
export function ResolvedCell({ cellData }: DefaultCellComponentProps) {
  return <span>{cellData ? COPY.resolvedCell : COPY.openCell}</span>
}
