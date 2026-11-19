/**
 * A fact or text nobody has supplied yet (CLAUDE.md, non-negotiable 1). Renders the
 * kit's `.iiic-todo` chip with the input or decision it waits on, so the placeholder
 * report reads as a to-do list for IIIC. Never replace it with invented content.
 */
export function Todo({ what, id }: { what: string; id: string }) {
  return (
    <span className="iiic-todo" data-todo={id}>
      [[TODO: {what}, {id}]]
    </span>
  )
}
