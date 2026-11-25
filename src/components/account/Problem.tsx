import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'

/**
 * The kit's error summary for a form the server drew again after a refusal (src/brand/
 * gallery.html, "Form"; docs/12 §9): focused when the page arrives, so a keyboard and a screen
 * reader land on what to do; the problem links to the field it is about, when there is one.
 */
export function Problem({
  id,
  heading,
  message,
  field,
}: {
  id: string
  heading: string
  message: string
  field?: string
}) {
  return (
    <>
      <div className="iiic-error-summary" role="alert" tabIndex={-1} id={id}>
        <h2>{heading}</h2>
        <ul>
          <li>{field ? <a href={`#${field}`}>{message}</a> : message}</li>
        </ul>
      </div>
      <FocusOnArrival id={id} />
    </>
  )
}
