import { SEARCH_COPY } from '@/lib/search/copy'
import { MAX_QUERY_LENGTH } from '@/lib/search/text'

import styles from './search.module.css'

/**
 * The site's search field (docs/11 §5.3): one labelled field and its button in a plain GET form
 * to /search, so it works without JavaScript and a result page can be returned to. /search and
 * the 404's "Where were you headed?" (docs/11 §5.1, item 7) both draw it. The field takes no
 * more than the server searches, and the browser is asked not to keep what is typed in it.
 */
export function SearchForm({
  id,
  label,
  defaultValue,
  help,
}: {
  id: string
  label: string
  defaultValue?: string
  help?: string
}) {
  const helpId = `${id}-help`
  return (
    <form className={styles.form} role="search" action="/search" method="get">
      <label className="iiic-label" htmlFor={id}>
        {label}
      </label>
      <div className={styles.row}>
        <input
          className={`iiic-field ${styles.field}`}
          id={id}
          name="q"
          type="search"
          maxLength={MAX_QUERY_LENGTH}
          defaultValue={defaultValue}
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={help ? helpId : undefined}
        />
        <button className="iiic-btn iiic-btn-primary" type="submit">
          {SEARCH_COPY.button}
        </button>
      </div>
      {help ? (
        <p className="iiic-help" id={helpId}>
          {help}
        </p>
      ) : null}
    </form>
  )
}
