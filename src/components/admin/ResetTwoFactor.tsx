'use client'

import {
  Button,
  ConfirmationModal,
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useModal,
} from '@payloadcms/ui'

const MODAL = 'reset-two-factor'

/**
 * On a staff record, for owners viewing someone else: reset that person's two-factor
 * (src/lib/auth/resetTwoFactor.ts). Built from Payload's own admin components.
 */
export function ResetTwoFactor() {
  const { id } = useDocumentInfo()
  const { user } = useAuth<{ id: number | string; roles?: string[] }>()
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const { openModal } = useModal()

  if (id === undefined || !user?.roles?.includes('owner') || String(user.id) === String(id)) {
    return null
  }

  // Never throws: Payload's modal waits for this to finish before it closes.
  async function reset() {
    try {
      const response = await fetch(`${serverURL}${api}/users/${id}/reset-two-factor`, {
        method: 'POST',
        credentials: 'include',
      })
      const body: { message?: string } = await response.json().catch(() => ({}))
      if (response.ok) {
        toast.success('Two-factor reset. They set up a new authenticator when they next sign in.')
      } else {
        toast.error(body.message ?? 'Two-factor was not reset. Try again.')
      }
    } catch {
      toast.error(
        'Two-factor was not reset: that did not go through. Check your connection and try again.',
      )
    }
  }

  return (
    <div className="field-type">
      <Button buttonStyle="secondary" onClick={() => openModal(MODAL)} size="medium">
        Reset two-factor
      </Button>
      <ConfirmationModal
        modalSlug={MODAL}
        heading="Reset two-factor?"
        body="Their open sessions end, and they set up a new authenticator when they next sign in. Their password stays the same: if their phone was lost or someone else may know the password, set a new one for them too."
        confirmLabel="Reset two-factor"
        cancelLabel="Cancel"
        onConfirm={reset}
      />
    </div>
  )
}
