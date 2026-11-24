import type { ReactNode } from 'react'

import styles from './account.module.css'

/**
 * The kit's table wrap as a named region (src/brand/gallery.html, "Table"): on a narrow screen
 * the table scrolls inside it and never the page, and the region takes focus so a keyboard can
 * scroll it too (WCAG 2.1.1), as src/components/blocks/PageBlocks.tsx does.
 */
export function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={`iiic-table-wrap ${styles.tableRegion}`}
      role="region"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region needs keyboard focus
      tabIndex={0}
    >
      {children}
    </div>
  )
}
