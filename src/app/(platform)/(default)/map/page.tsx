import type { Metadata } from 'next'

import { Todo } from '@/components/Todo'
import { STEP_ZERO_CHOICES, STEP_ZERO_QUESTION } from '@/lib/map/stepZero'

export const metadata: Metadata = { title: 'Find your path' }

/**
 * Find your path: step 0 of the Map (docs/02; docs/03 F1). One question in the kit's choice
 * cards; the answer goes to /map/go, which sends the visitor to their door. It is a plain form,
 * so it works without JavaScript, and no answer is chosen for the visitor. The line under the
 * question is a proposal until IIIC approves it (copy architecture §4.10, I-41).
 */
export default function FindYourPathPage() {
  return (
    <section className="iiic-page-narrow" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="iiic-kicker">Find your path</div>
      <h1 style={{ margin: '14px 0 16px' }}>{STEP_ZERO_QUESTION}</h1>
      <p className="iiic-lede">
        <Todo what="approval of the line under the question" id="I-41" />
      </p>
      <form action="/map/go" method="get" style={{ marginTop: 32 }}>
        <fieldset className="iiic-fieldset">
          <legend className="iiic-sr-only">{STEP_ZERO_QUESTION}</legend>
          <div className="iiic-choices">
            {STEP_ZERO_CHOICES.map((choice) => (
              <label className="iiic-choice" key={choice.value}>
                <input type="radio" name="who" value={choice.value} required />
                <span className="iiic-choice-body">
                  <strong>{choice.label}</strong>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="iiic-row" style={{ marginTop: 24 }}>
          <button className="iiic-btn iiic-btn-primary iiic-btn-lg" type="submit">
            Continue
          </button>
        </div>
      </form>
    </section>
  )
}
