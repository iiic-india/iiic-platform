import 'server-only'

import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'

import { env } from '@/lib/env'
import config from '@payload-config'

import type { RenderCertificatePdf } from './contract'
import { emitCertificateEvent } from './events'
import { type CertificateActions, makeCertificateActions } from './issue'
import { certificateStoreFor } from './store'
import { readCertificateTemplate } from './template'
import { newVerifyToken } from './token'
import { makeVerify } from './verify'

/**
 * The certificates module joined to this deployment (docs/18 §4): the store it keeps PDFs in, the
 * kit's template, the site's origin for the QR code's link, and the PDF renderer.
 *
 * The renderer is M3's (src/lib/pdf/render.ts, D-09), which this branch does not hold yet. Until
 * the branches are joined, `render` is null and an issue answers `render-failed` ("PDFs cannot be
 * made here yet"), so no certificate is ever issued without its PDF; the preview works. At the
 * join, these two lines take M3's functions:
 *
 *   render: (html) => renderPdf(html, { serverless: Boolean(env().VERCEL_ENV) }),
 *   selfContain: (html) => selfContained(html, printTemplateDir()),
 */
const render: RenderCertificatePdf | null = null
const selfContain = async (html: string): Promise<string> => html

let actions: CertificateActions | undefined

export function certificateActions(): CertificateActions {
  actions ??= makeCertificateActions({
    store: () => certificateStoreFor(env()),
    render,
    selfContain,
    template: readCertificateTemplate,
    siteUrl: () => env().siteUrl,
    now: () => new Date(),
    newToken: () => newVerifyToken(),
    newBatch: () => randomUUID(),
    emit: emitCertificateEvent,
  })
  return actions
}

/** The public lookups behind /institute/verify. */
export const { verifyById, verifyByToken } = makeVerify(() => getPayload({ config }))
