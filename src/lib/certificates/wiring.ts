import 'server-only'

import { randomUUID } from 'node:crypto'

import { getPayload } from 'payload'

import { env } from '@/lib/env'
import { printTemplateDir, selfContained } from '@/lib/pdf/templates'
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
 * The renderer is M3's (src/lib/pdf/render.ts, D-09): headless Chromium, the serverless build on
 * Vercel and Playwright's own elsewhere. The page is made self-contained first, the kit's
 * stylesheet, fonts and logo inlined from src/brand (next.config.ts ships them with the
 * certificate routes under /api/**), so the PDF prints what the preview shows. The renderer's
 * module is loaded on the first issue, as M3's document jobs load theirs, so the verify pages and
 * the issue screen, which import this file, never load the browser driver. The tests give
 * makeCertificateActions a fake renderer of their own.
 */
const render: RenderCertificatePdf | null = async (html) => {
  const { renderPdf } = await import('@/lib/pdf/render')
  return renderPdf(html, { serverless: Boolean(env().VERCEL_ENV) })
}
const selfContain = (html: string): Promise<string> => selfContained(html, printTemplateDir())

/** Whether this deployment can make PDFs; the issue screen says so when it cannot. */
export const RENDERER_WIRED: boolean = render !== null

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
