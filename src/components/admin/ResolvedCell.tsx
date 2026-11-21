'use client'

import type { DefaultCellComponentProps } from 'payload'

import { REDIRECTS_COPY as COPY } from './redirectsCopy'

/** The 404 log's "Redirect" column: whether a redirect sends the address on yet, in words. */
export function ResolvedCell({ cellData }: DefaultCellComponentProps) {
  return <span>{cellData ? COPY.resolvedCell : COPY.openCell}</span>
}
