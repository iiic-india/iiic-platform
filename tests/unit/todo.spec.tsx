import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Todo } from '@/components/Todo'

describe('Todo', () => {
  it('renders the placeholder with its input ID in the kit chip', () => {
    const { container } = render(<Todo what="course dates" id="I-14" />)
    const chip = container.querySelector('.iiic-todo')
    expect(chip?.textContent).toBe('[[TODO: course dates, I-14]]')
    expect(chip?.getAttribute('data-todo')).toBe('I-14')
  })
})
