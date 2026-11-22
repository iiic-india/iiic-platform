import type { DocumentError, Rendered } from '@/lib/pdf/documents'
import type { InvoiceDocument } from '@/lib/pdf/invoice'
import type { Result } from '@/lib/result'
import type { ZohoBooks, ZohoError } from '@/lib/zoho/books'

/**
 * What the documents module runs with (docs/16 §12, builder F): Zoho Books (or why there is
 * none), where the client's PDF is kept, the renderer and the clock. The server's own is built in
 * src/lib/invoicing/wiring.ts; tests pass the fake Zoho, an in-memory store and a renderer that
 * records what it was given.
 */

/** The private documents bucket (docs/07): a PDF goes in under its key, never public. */
export interface DocumentStore {
  put(key: string, bytes: Uint8Array): Promise<Result<void, { code: 'unavailable' }>>
}

export type DocumentsDeps = {
  zoho: () => Result<ZohoBooks, ZohoError>
  /** Null while the private bucket is not set up: the PDF is not made, Zoho's own stays. */
  store: DocumentStore | null
  renderPdf: (doc: InvoiceDocument) => Promise<Result<Rendered, DocumentError>>
  now: () => Date
}
