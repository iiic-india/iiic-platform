'use client'

import { Button, toast } from '@payloadcms/ui'

import { TWO_FACTOR_COPY as COPY } from '@/plugins/totpCopy'

type Props = {
  value: string
  label: string
  /** The confirmation shown once the text is on the clipboard. */
  copied: string
}

/**
 * Copies text with Payload's own Button and toast. Payload's CopyToClipboard names its button
 * only through a tooltip that exists on hover, so a screen reader would find an unnamed button.
 */
export function CopyButton({ value, label, copied }: Props) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(copied)
    } catch {
      toast.error(COPY.copyFailed)
    }
  }

  return (
    <Button buttonStyle="secondary" size="small" onClick={copy}>
      {label}
    </Button>
  )
}
