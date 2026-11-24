import type { UIFieldServerComponent } from 'payload'

import { mayOpen } from '@/access/views'

import { RequestActionsPanel } from './RequestActionsPanel'

type Saved = {
  type?: string
  status?: string
  verifiedAt?: string | null
  exportKey?: string | null
}

/**
 * On a saved erasure or access request (docs/18 §5): the plan and the owner's confirmation, or
 * the export. Shown only to those who may open Privacy; the confirming parts only to an owner.
 * The routes check the user, the code and the role again (src/lib/privacy/endpoints.ts).
 */
export const RequestActions: UIFieldServerComponent = ({ data, id, req }) => {
  if (id === undefined || id === null || !mayOpen(req.user, 'privacy')) return null
  const saved = (data ?? {}) as Saved
  if (saved.type !== 'erasure' && saved.type !== 'access') return null
  return (
    <RequestActionsPanel
      hasExport={Boolean(saved.exportKey)}
      isOwner={mayOpen(req.user, 'privacyDecision')}
      requestId={Number(id)}
      status={saved.status ?? 'received'}
      type={saved.type}
      verified={Boolean(saved.verifiedAt)}
    />
  )
}
