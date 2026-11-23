# NOTES · m5-certificates (slice B, docs/18 §4, §10 B)

Working notes for a run that may be cut off. Removed in the last commit.

## Interfaces built against (base m5/foundation)

- `src/lib/certificates/contract.ts`: issueInput, revokeInput, reissueInput, CertificateError,
  CertificatePreview, IssuedCertificate, VerificationView, CertificateStore, RenderCertificatePdf,
  PreviewCertificates, IssueCertificates, RevokeCertificate, ReissueCertificate, VerifyByToken, VerifyById.
- `src/lib/certificates/ids.ts`: formatCertificateId, parseCertificateId, typedCertificateId, verifyToken.
- `src/lib/certificates/statement.ts`: CERTIFICATE_STATEMENT (fixed, I-22).
- `src/access/views.ts`: viewRefusal(user, 'certificatesIssue' | 'certificatesRevoke').
- Collection `certificates`: all fields server-written (overrideAccess: true from the module).
- Settings global `settings.certificates.signatoryName/signatoryTitle` (I-51).
- Audit: `req.context.auditAction` on create/update; `recordAudit(req, {...})` for downloads.
- env: `R2_BUCKET_PRIVATE` (+ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).
- PDF: M3's `renderPdf(html, { serverless })` and `selfContained(html, printTemplateDir())` on
  m3/join (not in base). Coded against `RenderCertificatePdf`; wiring returns null until the join.

## Files (slice B only)

- src/lib/certificates/: token.ts, template.ts, qr.ts, store.ts, wiring.ts, issue.ts, revoke.ts,
  verify.ts, download.ts, events.ts
- src/app/api/certificates/[id]/pdf/route.ts
- src/components/admin/certificates/ (issue view, preview, revoke/reissue)
- src/app/(platform)/(education)/institute/verify/page.tsx, [token]/page.tsx, copy
- payload.config.ts block `// M5 B`
- tests: unit certificates*.spec.ts, int certificates.int.spec.ts, e2e certificates.e2e.spec.ts

## Order of work

1. NOTES (this) 2. token/template/qr/store + unit tests 3. issue/revoke/reissue/verify + tests
4. download route 5. verify pages 6. admin view 7. e2e QR test 8. checks

## Progress

- [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7 · [ ] 8
