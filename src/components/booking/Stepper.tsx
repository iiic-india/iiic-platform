import { FLOW_COPY } from './copy'

/**
 * The kit's stepper (src/brand/gallery.html, "Steps"): an ordered list whose current step is
 * marked with aria-current, so a screen reader announces where the person is (docs/03 F3,
 * Accessibility). The step names are text, never colour alone.
 */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="iiic-stepper" aria-label={FLOW_COPY.progress}>
      {steps.map((name, index) => (
        <li
          key={name}
          data-state={index < current ? 'done' : index === current ? 'current' : undefined}
          aria-current={index === current ? 'step' : undefined}
        >
          <span>{name}</span>
        </li>
      ))}
    </ol>
  )
}
