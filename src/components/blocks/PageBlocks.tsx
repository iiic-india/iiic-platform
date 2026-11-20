import Link from 'next/link'

import { Todo } from '@/components/Todo'
import type { PageBlock, PageContent } from '@/lib/content/types'
import type {
  BandBlock,
  ComparisonBlock,
  DoorsBlock,
  FactListBlock,
  FounderNoteBlock,
  HeroBlock,
  PointsBlock,
  StatementBlock,
  StepsBlock,
} from '@/payload-types'

import styles from './blocks.module.css'
import { renderText } from './text'

/**
 * The page blocks, drawn with the kit's markup (src/brand/templates/web/landing.html;
 * gallery.html, "Patterns"). Server components: none of them needs the browser.
 */

/** Marks a block whose wording IIIC has not approved yet (I-41). It goes when the copy is approved. */
function CandidateMark({ status }: { status: 'approved' | 'candidate' }) {
  if (status !== 'candidate') return null
  return (
    <div className={styles.candidate}>
      <span className="iiic-badge" data-candidate="I-41">
        Candidate copy, awaiting IIIC’s approval (I-41)
      </span>
    </div>
  )
}

type Action = { label?: string | null; href?: string | null } | undefined

function ActionLink({
  action,
  variant,
  large = false,
}: {
  action: Action
  variant: 'primary' | 'secondary'
  large?: boolean
}) {
  if (!action?.label || !action.href) return null
  return (
    <Link
      className={`iiic-btn iiic-btn-${variant}${large ? ' iiic-btn-lg' : ''}`}
      href={action.href}
    >
      {action.label}
    </Link>
  )
}

function SectionHead({
  kicker,
  heading,
  intro,
}: {
  kicker?: string | null
  heading: string
  intro?: string | null
}) {
  return (
    <div className="iiic-section-head">
      <div>
        {kicker ? <div className="iiic-kicker">{renderText(kicker)}</div> : null}
        <h2 className="iiic-marked">{renderText(heading)}</h2>
      </div>
      {intro ? <p>{renderText(intro)}</p> : null}
    </div>
  )
}

function Hero({ block }: { block: HeroBlock }) {
  return (
    <section className={`iiic-hero ${styles.heroSolo}`}>
      <div>
        <CandidateMark status={block.copyStatus} />
        {block.kicker ? <div className="iiic-kicker">{renderText(block.kicker)}</div> : null}
        <h1>{renderText(block.heading)}</h1>
        {block.lead ? <p>{renderText(block.lead)}</p> : null}
        <div className="iiic-row">
          <ActionLink action={block.primary} variant="primary" large />
          <ActionLink action={block.secondary} variant="secondary" large />
        </div>
      </div>
    </section>
  )
}

function Doors({ block }: { block: DoorsBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} intro={block.intro} />
      <div className="iiic-doors">
        {block.doors.map((door) => (
          <Link className="iiic-card iiic-card-door" href={door.href} key={door.id ?? door.href}>
            {door.glyph ? (
              <div className="iiic-door-glyph" aria-hidden="true">
                {door.glyph}
              </div>
            ) : null}
            {door.audience ? <div className="iiic-kicker">{renderText(door.audience)}</div> : null}
            <h3>{renderText(door.question)}</h3>
            {door.line ? <p>{renderText(door.line)}</p> : null}
            {door.outcomes ? <p className="iiic-type-small">{renderText(door.outcomes)}</p> : null}
            {door.action ? (
              <span className="iiic-btn iiic-btn-secondary">{door.action}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

function Statement({ block }: { block: StatementBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      <div className="iiic-prose">
        {block.paragraphs.map((paragraph, index) => (
          <p className={index === 0 ? 'iiic-lede' : undefined} key={paragraph.id ?? index}>
            {renderText(paragraph.text)}
          </p>
        ))}
      </div>
      {block.action?.label && block.action.href ? (
        <div className={`iiic-row ${styles.actions}`}>
          <ActionLink action={block.action} variant="secondary" />
        </div>
      ) : null}
    </section>
  )
}

function Steps({ block }: { block: StepsBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      <ol className="iiic-steps">
        {block.steps.map((step, index) => (
          <li key={step.id ?? index}>
            <strong>{renderText(step.title)}</strong>
            {step.text ? <p>{renderText(step.text)}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Two ways of living, line against line, as a plain table: the view the flip of docs/11 §3.2
 * falls back to without JavaScript and in print. Each row is headed by its first cell, so a
 * screen reader reads the pair together.
 */
function Comparison({ block }: { block: ComparisonBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      {/* On a narrow screen the table scrolls inside this region, never the page; the region
          takes focus so that a keyboard can scroll it too (WCAG 2.1.1). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region needs keyboard focus */}
      <div className="iiic-table-wrap" role="region" aria-label={block.heading} tabIndex={0}>
        <table className="iiic-table">
          <thead>
            <tr>
              <th scope="col">{renderText(block.leftLabel)}</th>
              <th scope="col">{renderText(block.rightLabel)}</th>
            </tr>
          </thead>
          <tbody>
            {block.pairs.map((pair, index) => (
              <tr key={pair.id ?? index}>
                <td>{renderText(pair.left)}</td>
                <td>
                  <strong>{renderText(pair.right)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Points({ block }: { block: PointsBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      <div className="iiic-prose">
        {block.lead ? <p className="iiic-lede">{renderText(block.lead)}</p> : null}
        <ul>
          {block.points.map((point, index) => (
            <li key={point.id ?? index}>{renderText(point.text)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function FactList({ block }: { block: FactListBlock }) {
  return (
    <section className="iiic-section">
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      <div className="iiic-strip">
        {block.facts.map((fact, index) => (
          <div key={fact.id ?? index}>
            <p className="iiic-lede">{renderText(fact.statement)}</p>
            {fact.source ? <p className="iiic-type-small">{renderText(fact.source)}</p> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function FounderNote({ block }: { block: FounderNoteBlock }) {
  return (
    <section className="iiic-section iiic-split">
      <div className="iiic-image-frame">
        <Todo what="the founder’s photograph, as he wants it published" id="I-10" />
      </div>
      <div>
        <CandidateMark status={block.copyStatus} />
        {block.kicker ? <div className="iiic-kicker">{renderText(block.kicker)}</div> : null}
        <h2 className={`iiic-marked ${styles.splitHeading}`}>{renderText(block.heading)}</h2>
        <p className="iiic-lede iiic-prose">{renderText(block.note)}</p>
        {block.attribution ? (
          <p className="iiic-type-small">{renderText(block.attribution)}</p>
        ) : null}
      </div>
    </section>
  )
}

/** The one yellow band of a page. It spans the window, so it sits outside the page column. */
function Band({ block, marked }: { block: BandBlock; marked: boolean }) {
  return (
    <section className={`iiic-band iiic-band-yellow${marked ? '' : ` ${styles.band}`}`}>
      <div className="iiic-page iiic-cta">
        <div>
          {block.kicker ? <div className="iiic-kicker">{renderText(block.kicker)}</div> : null}
          <h2>{renderText(block.heading)}</h2>
          {block.lead ? <p>{renderText(block.lead)}</p> : null}
          {block.sanskrit || block.translation ? (
            <p>
              {block.sanskrit ? <span lang="sa">{block.sanskrit}</span> : null}
              {block.sanskrit && block.translation ? ' · ' : null}
              {block.translation}
            </p>
          ) : null}
        </div>
        <div className="iiic-row">
          <ActionLink action={block.primary} variant="primary" large />
        </div>
      </div>
    </section>
  )
}

function Section({ block }: { block: Exclude<PageBlock, BandBlock> }) {
  switch (block.blockType) {
    case 'hero':
      return <Hero block={block} />
    case 'doors':
      return <Doors block={block} />
    case 'statement':
      return <Statement block={block} />
    case 'steps':
      return <Steps block={block} />
    case 'comparison':
      return <Comparison block={block} />
    case 'points':
      return <Points block={block} />
    case 'factList':
      return <FactList block={block} />
    case 'founderNote':
      return <FounderNote block={block} />
  }
}

/** A page's sections in order, in the page column, and its closing band across the window. */
export function RenderBlocks({ layout }: { layout: PageContent['layout'] }) {
  const band = layout.find((block): block is BandBlock => block.blockType === 'band')
  const sections = layout.filter(
    (block): block is Exclude<PageBlock, BandBlock> => block.blockType !== 'band',
  )
  return (
    <>
      <div className={`iiic-page ${styles.page}`}>
        {sections.map((block, index) => (
          <Section block={block} key={block.id ?? index} />
        ))}
        {band?.copyStatus === 'candidate' ? (
          <div className={styles.band}>
            <CandidateMark status={band.copyStatus} />
          </div>
        ) : null}
      </div>
      {band ? <Band block={band} marked={band.copyStatus === 'candidate'} /> : null}
    </>
  )
}
