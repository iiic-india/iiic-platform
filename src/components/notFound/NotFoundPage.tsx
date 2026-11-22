import Link from 'next/link'

import { CandidateMark, Scope } from '@/components/blocks/PageBlocks'
import { SearchForm } from '@/components/search/SearchForm'
import { MainLinks } from '@/components/site/MainLinks'
import { Todo } from '@/components/Todo'
import { FIXED_PLACEHOLDERS, NOT_FOUND_QUESTION_PLACEHOLDERS } from '@/lib/content/placeholders'
import {
  NOT_FOUND_COPY,
  NOT_FOUND_LINES,
  notFoundVariant,
  poolFor,
  questionFor,
  type NotFoundLine,
} from '@/lib/notFound/copy'

import styles from './notFound.module.css'
import { YourLine } from './YourLine'

/** An approved line as it is, or its placeholder while IIIC has not approved one (I-41). */
function Line({
  line,
  placeholder,
}: {
  line: NotFoundLine | null
  placeholder: { id: string; what: string }
}) {
  return line ? line.text : <Todo {...placeholder} />
}

/**
 * The 404 (docs/11 §5.1; D-29), in the register of the path asked for (docs/02). In order: it
 * owns the broken link (the kicker, the headline, the line); then one question for where the
 * visitor was headed, with "Why a question?"; then a line they may write, the bar growing as they
 * write, and nothing stored or sent; then "Find your path" and "Take the line with you"; then
 * "Where were you headed?" (search) and the eight main links. On a counselling path the page is
 * the plain one: the kicker, the headline, the line, search and the links, and the scope
 * statement with the crisis numbers above the footer, with no question, no writing and no device.
 * The keyboard meets the field, the actions, the search and the links in that order, and nothing
 * takes the focus by itself.
 */
export function NotFoundPage({ path }: { path: string }) {
  const plain = notFoundVariant(path) === 'plain'
  const { headline, line } = NOT_FOUND_LINES
  const question = plain ? null : questionFor(path)
  const candidate = [headline, line, question].some((shown) => shown?.candidate)
  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      {candidate ? <CandidateMark status="candidate" /> : null}
      <p className="iiic-kicker">{NOT_FOUND_COPY.kicker}</p>
      <h1 className={styles.headline}>
        <Line line={headline} placeholder={FIXED_PLACEHOLDERS.notFoundHeadline} />
      </h1>
      <p className="iiic-lede">
        <Line line={line} placeholder={FIXED_PLACEHOLDERS.notFoundLine} />
      </p>
      {plain ? null : (
        <>
          <div className={styles.question}>
            {/* Not for search snippets (docs/12 §3): it changes with the address asked for. */}
            <p className={styles.questionText} data-nosnippet="">
              <Line line={question} placeholder={NOT_FOUND_QUESTION_PLACEHOLDERS[poolFor(path)]} />
            </p>
            <p>
              <Link className="iiic-link" href="/framework" prefetch={false}>
                {NOT_FOUND_COPY.whyQuestion}
              </Link>
            </p>
          </div>
          <YourLine
            id="your-line"
            label={NOT_FOUND_COPY.yourLine}
            help={NOT_FOUND_COPY.yourLineHelp}
            takeLabel={NOT_FOUND_COPY.takeTheLine}
          >
            <Link className="iiic-btn iiic-btn-primary" href="/map" prefetch={false}>
              {NOT_FOUND_COPY.findYourPath}
            </Link>
          </YourLine>
        </>
      )}
      <div className={styles.headed}>
        <SearchForm id="where-headed" label={NOT_FOUND_COPY.whereHeaded} />
        <MainLinks label={NOT_FOUND_COPY.links} />
      </div>
      {plain ? <Scope /> : null}
    </section>
  )
}
