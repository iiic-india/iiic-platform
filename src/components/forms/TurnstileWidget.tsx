'use client'

import { useEffect, useRef } from 'react'

import { TURNSTILE_NOSCRIPT } from '@/lib/enquiryForms/strings'
import { TURNSTILE_SCRIPT_URL } from '@/lib/enquiryForms/turnstileOrigin'

/**
 * Cloudflare Turnstile's check on a public form, drawn only where both its keys are set
 * (docs/17 §6). The script is loaded once, on the first form that needs it, by this component's
 * own code, which the page's nonce lets run ('strict-dynamic'); the widget puts its token in a
 * hidden field of the form (`cf-turnstile-response`), which the server checks with Cloudflare.
 * The form draws it again after every answer, as a token is good for one check only. Without
 * JavaScript there is no check, and the form says to write to the office instead.
 */

type TurnstileApi = {
  render: (container: HTMLElement, options: { sitekey: string; action?: string }) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'))
    script.onerror = () => {
      loading = null
      reject(new Error('Turnstile did not load'))
    }
    document.head.append(script)
  })
  return loading
}

export function TurnstileWidget({ siteKey, action }: { siteKey: string; action: string }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let widgetId: string | null = null
    let gone = false
    loadTurnstile()
      .then((turnstile) => {
        if (gone || !container.current) return
        widgetId = turnstile.render(container.current, { sitekey: siteKey, action })
      })
      .catch(() => {
        // Without the check the server refuses the form and says to send it again.
      })
    return () => {
      gone = true
      if (widgetId !== null) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, action])
  return (
    <div className="full">
      <div ref={container} />
      <noscript>
        <p className="iiic-help">{TURNSTILE_NOSCRIPT}</p>
      </noscript>
    </div>
  )
}
