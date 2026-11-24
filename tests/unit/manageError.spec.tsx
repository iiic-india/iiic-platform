// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import ManageError from '@/app/(platform)/(booking)/b/[token]/error'

// The manage page's 500 (docs/11 §5.2): its address says nothing of the booking's kind, so it
// always carries the scope statement and the crisis numbers a counselling page needs (docs/08 §7).

describe('the manage page’s 500', () => {
  it('carries the scope statement and the crisis numbers', () => {
    const html = renderToStaticMarkup(
      <ManageError error={Object.assign(new Error('fake failure'), { digest: 'fake-digest' })} />,
    )
    expect(html).toContain('id="scope"')
    for (const number of ['14416', '112', '1098']) expect(html).toContain(number)
  })
})
