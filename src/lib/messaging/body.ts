/** A provider's webhook body is a few kilobytes; anything far larger is not one (docs/19 §4). */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024

/** The raw body as sent, or null when it is larger than a webhook's can be. */
export async function readWebhookBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BODY_BYTES) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
