/**
 * What every certificate and the course page say about the certificate (docs/08 §7;
 * src/brand/VOICE.md, "Certificates and affiliation"): a certificate of completion from a
 * privately owned institute, never a degree or diploma and never a sign of recognition. The
 * wording lives here, once. It is a draft until the lawyer clears it (I-22).
 */

/** The input the wording waits on: the lawyer's review. */
export const CERTIFICATE_AWAITS = 'I-22'

export const CERTIFICATE_HEADING = 'The certificate'

export const CERTIFICATE_STATEMENT = [
  'Certificate of Completion.',
  'Issued by Indian Institute of Image Catalysts, a privately owned sole proprietorship, Ahmedabad.',
  'Not a degree or diploma; not affiliated with, approved or recognised by UGC, AICTE, any university or any Government body.',
] as const
