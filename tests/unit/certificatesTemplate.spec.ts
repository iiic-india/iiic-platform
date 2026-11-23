// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import {
  escapeHtml,
  fillCertificate,
  fillTemplate,
  readCertificateTemplate,
  signatoryFrom,
  STATEMENT_TEXT,
  type CertificateFields,
} from '@/lib/certificates/template'

// The certificate's page from the kit's template (docs/18 §4): every field filled and escaped,
// the fixed statement, the signatory or its placeholder (I-51), and no word that would make the
// certificate a degree, a diploma or a mark of recognition (CLAUDE.md #9). Every name is fake.

const fields = (over: Partial<CertificateFields> = {}): CertificateFields => ({
  certificateId: 'IIIC-C-2099-0001-5',
  issuedAt: new Date('2099-01-15T06:00:00Z'),
  nameAsPrinted: 'Example Learner',
  programmeName: 'Example Programme (fake)',
  programmeDetails: 'Example dates (fake)',
  signatory: { name: 'Example Signatory', title: 'Example Title' },
  verifyUrl: 'https://example.invalid/institute/verify/AAAAAAAAAAAAAAAAAAAAAA',
  qrSvg: '<svg aria-hidden="true"></svg>',
  ...over,
})

describe('the certificate page', () => {
  it('fills every field of the kit’s template, leaving no braces', async () => {
    const template = await readCertificateTemplate()
    const { html, waitingFor } = fillCertificate(template, fields())
    expect(html).not.toMatch(/\{\{|\}\}/)
    expect(waitingFor).toEqual([])
    expect(html).toContain('Example Learner')
    expect(html).toContain('IIIC-C-2099-0001-5')
    expect(html).toContain('15 January 2099')
    expect(html).toContain('Example Signatory')
    expect(html).toContain('<svg aria-hidden="true"></svg>')
    expect(html).toContain(escapeHtml(STATEMENT_TEXT))
  })

  it('prints the fixed statement, which says what the certificate is not', () => {
    expect(STATEMENT_TEXT).toContain('Certificate of Completion.')
    expect(STATEMENT_TEXT).toContain('Not a degree or diploma')
    expect(CERTIFICATE_STATEMENT).toHaveLength(3)
  })

  it('never claims a degree, a diploma or recognition outside the statement’s own denial', async () => {
    const template = await readCertificateTemplate()
    const { html } = fillCertificate(template, fields())
    const text = html
      .replace(escapeHtml(STATEMENT_TEXT), '')
      .replace(/<[^>]+>/g, ' ')
      .toLowerCase()
    for (const word of [
      'degree',
      'diploma',
      'university',
      'accredited',
      'recognised',
      'approved',
    ]) {
      expect(text).not.toContain(word)
    }
  })

  it('escapes what staff typed, so a name cannot become markup', async () => {
    const template = await readCertificateTemplate()
    const { html } = fillCertificate(
      template,
      fields({ nameAsPrinted: '<img src=x onerror=alert(1)> & "Co"' }),
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Co&quot;')
  })

  it('shows the signatory’s placeholder with its input ID while Settings lacks it', async () => {
    const template = await readCertificateTemplate()
    const { html, waitingFor } = fillCertificate(template, fields({ signatory: null }))
    expect(waitingFor).toEqual(['I-51'])
    expect(html).toContain('<span class="iiic-todo">[[TODO: signatory’s name as printed, I-51]]')
  })

  it('needs both the name and the title of the signatory', () => {
    expect(signatoryFrom({ signatoryName: 'Example', signatoryTitle: ' ' })).toBeNull()
    expect(signatoryFrom(undefined)).toBeNull()
    expect(signatoryFrom({ signatoryName: ' Example ', signatoryTitle: 'Title' })).toEqual({
      name: 'Example',
      title: 'Title',
    })
  })

  it('refuses a field the code does not fill, and keeps a dollar sign as typed', () => {
    expect(() => fillTemplate('{{unknown}}', {})).toThrow(/unknown/)
    expect(fillTemplate('{{a}}', { a: 'US$ $& $1' })).toBe('US$ $& $1')
  })
})
