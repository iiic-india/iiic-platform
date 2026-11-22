import Link from 'next/link'

import experience from '@/components/experience/experience.module.css'
import { FlipLines } from '@/components/experience/FlipLines'
import { InsightNav } from '@/components/experience/InsightNav'
import { RevealChapters } from '@/components/experience/RevealChapters'
import { FirstVoice, PlainVoices, WithVoice } from '@/components/proof/Voices'
import { Todo } from '@/components/Todo'
import {
  CERTIFICATE_AWAITS,
  CERTIFICATE_HEADING,
  CERTIFICATE_STATEMENT,
} from '@/lib/certificates/statement'
import { LEGAL_REVIEW_AWAITS } from '@/lib/content/legalReview'
import { FIXED_PLACEHOLDERS } from '@/lib/content/placeholders'
import type { FaqItem, PageBlock, PageContent } from '@/lib/content/types'
import { type Devices, devicesAt } from '@/lib/experience/narrative'
import { isCounsellingPage } from '@/lib/proof/reviews'
import { NO_VOICES, type PageVoices } from '@/lib/proof/voices'
import {
  LEGAL_INFORMATION_COLUMNS,
  LEGAL_INFORMATION_HEADING,
  legalRows,
  NO_LEGAL_INFORMATION,
  type LegalInformation,
} from '@/lib/settings/legal'
import { CONTACT, CONTACT_HEADING, mailHref, telHref } from '@/lib/site/contact'
import type {
  BandBlock,
  CardsBlock,
  ComparisonBlock,
  DoorsBlock,
  FactListBlock,
  FaqBlock,
  FounderNoteBlock,
  HeroBlock,
  PointsBlock,
  StatementBlock,
  StepsBlock,
} from '@/payload-types'

import styles from './blocks.module.css'
import { Scope } from './Scope'
import { renderText } from './text'

/**
 * The page blocks, drawn with the kit's markup (src/brand/templates/web/landing.html;
 * gallery.html, "Patterns"). Server components: none of them needs the browser. On the
 * narrative pages a few are drawn as the experience devices (docs/11 §3; devicesAt), whose
 * moving parts are small client components in src/components/experience/.
 */

/** Marks a block whose wording IIIC has not approved yet (I-41). It goes when the copy is approved. */
export function CandidateMark({ status }: { status?: 'approved' | 'candidate' | null }) {
  if (status !== 'candidate') return null
  return (
    <div className={styles.candidate}>
      <span className="iiic-badge" data-candidate="I-41">
        Candidate copy, awaiting IIIC’s approval (I-41)
      </span>
    </div>
  )
}

/**
 * Marks wording a lawyer has yet to review (I-22): the fixed statements, and a legal page that
 * is still a draft. It goes when the review is done.
 */
function DraftMark({ what, awaits = LEGAL_REVIEW_AWAITS }: { what: string; awaits?: string }) {
  return (
    <div className={styles.candidate}>
      <span className="iiic-badge" data-draft={awaits}>
        {what}, awaiting legal review ({awaits})
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
      {renderText(action.label)}
    </Link>
  )
}

function SectionHead({
  kicker,
  heading,
  intro,
  headingId,
}: {
  kicker?: string | null
  heading: string
  intro?: string | null
  /** An id for the heading, when something on the page is named by it. */
  headingId?: string
}) {
  return (
    <div className="iiic-section-head">
      <div>
        {kicker ? <div className="iiic-kicker">{renderText(kicker)}</div> : null}
        <h2 className="iiic-marked" id={headingId}>
          {renderText(heading)}
        </h2>
      </div>
      {intro ? <p>{renderText(intro)}</p> : null}
    </div>
  )
}

function Hero({
  block,
  draft,
  firstVoice = null,
}: {
  block: HeroBlock
  draft: boolean
  /** The home page's first voice, under the actions (docs/11 §3.8). */
  firstVoice?: PageVoices['first']
}) {
  return (
    <section className={`iiic-hero ${styles.heroSolo}`}>
      <div>
        {draft ? <DraftMark what="Draft page" /> : null}
        <CandidateMark status={block.copyStatus} />
        {block.kicker ? <div className="iiic-kicker">{renderText(block.kicker)}</div> : null}
        <h1>{renderText(block.heading)}</h1>
        {block.lead ? <p>{renderText(block.lead)}</p> : null}
        <div className="iiic-row">
          <ActionLink action={block.primary} variant="primary" large />
          <ActionLink action={block.secondary} variant="secondary" large />
        </div>
        {block.note ? (
          <div className={`iiic-type-small ${styles.heroNote}`}>{renderText(block.note)}</div>
        ) : null}
        <FirstVoice voice={firstVoice} />
      </div>
    </section>
  )
}

function Doors({ block }: { block: DoorsBlock }) {
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
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
              <span className="iiic-btn iiic-btn-secondary">{renderText(door.action)}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

function Statement({ block }: { block: StatementBlock }) {
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
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
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      {block.lead ? (
        <p className={`iiic-lede iiic-prose ${styles.stepsLead}`}>{renderText(block.lead)}</p>
      ) : null}
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
 * Two ways of living, line against line, as a plain table. Each row is headed by its first
 * cell, so a screen reader reads the pair together. On a narrow screen the table scrolls
 * inside its region, never the page; the region takes focus so that a keyboard can scroll it
 * too (WCAG 2.1.1), with the kit's focus ring.
 */
function ComparisonTable({ block }: { block: ComparisonBlock }) {
  return (
    <div
      className={`iiic-table-wrap ${styles.tableRegion}`}
      role="region"
      aria-label={block.heading}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region needs keyboard focus
      tabIndex={0}
    >
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
              <th scope="row" className={styles.rowHead}>
                {renderText(pair.left)}
              </th>
              <td>
                <strong>{renderText(pair.right)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A comparison. On a narrative page it is Flip the line (docs/11 §3.2): the first column's
 * lines as buttons that turn to the second's, with the table behind "Show both", which is also
 * the view without JavaScript and in print. Elsewhere, as on the legal information page, it is
 * the table alone.
 */
function Comparison({
  block,
  flip,
  index,
}: {
  block: ComparisonBlock
  flip: boolean
  index: number
}) {
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} />
      {flip ? (
        <FlipLines
          id={`flip_${index}`}
          lines={block.pairs.map((pair) => ({
            object: renderText(pair.left),
            subject: renderText(pair.right),
          }))}
        >
          <ComparisonTable block={block} />
        </FlipLines>
      ) : (
        <ComparisonTable block={block} />
      )}
    </section>
  )
}

/**
 * A list of points under its question. With the sticky question (docs/11 §3.3) the question
 * stays in view beside its answers on wide screens; either way the question is read first,
 * then its answers.
 */
function Points({ block, sticky }: { block: PointsBlock; sticky: boolean }) {
  const head = <SectionHead kicker={block.kicker} heading={block.heading} />
  const answers = (
    <div className="iiic-prose">
      {block.lead ? <p className="iiic-lede">{renderText(block.lead)}</p> : null}
      <ul>
        {block.points.map((point, index) => (
          <li key={point.id ?? index}>{renderText(point.text)}</li>
        ))}
      </ul>
    </div>
  )
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      {sticky ? (
        <div className={experience.questionGrid}>
          <div className={experience.question}>{head}</div>
          {answers}
        </div>
      ) : (
        <>
          {head}
          {answers}
        </>
      )}
    </section>
  )
}

/** How wide a card is on the kit's twelve-column grid, by how many share the row. */
function cardSpan(count: number): string {
  if (count === 1) return 'iiic-span-12'
  if (count === 2) return 'iiic-span-6'
  return count === 4 ? 'iiic-span-3' : 'iiic-span-4'
}

/**
 * Cards set out as chapters do on the founders' page (docs/11 §3.3, §3.5): on wide screens the
 * section's question and the cards' titles stay in view on the left, the bar marking the card
 * in view, and the cards pass on the right; on phones the cards stand one under another. The
 * titles on the left are links to their cards; the cards keep their own headings, so the page
 * reads the same without JavaScript and to a screen reader.
 */
function Insights({ block, index }: { block: CardsBlock; index: number }) {
  const headingId = `insights_${index}`
  const ids = block.cards.map((_, card) => `insight_${index}_${card + 1}`)
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      <div className={experience.questionGrid}>
        <div className={experience.question}>
          <SectionHead
            kicker={block.kicker}
            heading={block.heading}
            intro={block.intro}
            headingId={headingId}
          />
          <InsightNav
            labelledBy={headingId}
            ids={ids}
            titles={block.cards.map((card) => renderText(card.title))}
          />
        </div>
        <div className={experience.insightCards}>
          {block.cards.map((card, at) => (
            <article className="iiic-card" id={ids[at]} key={card.id ?? at}>
              <h3>{renderText(card.title)}</h3>
              {card.text ? <p>{renderText(card.text)}</p> : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Cards({ block }: { block: CardsBlock }) {
  const span = cardSpan(block.cards.length)
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} intro={block.intro} />
      <div className="iiic-grid">
        {block.cards.map((card, index) => {
          const content = (
            <>
              <h3>{renderText(card.title)}</h3>
              {card.text ? <p>{renderText(card.text)}</p> : null}
              {card.href && card.action ? (
                <span className="iiic-btn iiic-btn-secondary">{renderText(card.action)}</span>
              ) : null}
            </>
          )
          return card.href ? (
            <Link className={`iiic-card ${span}`} href={card.href} key={card.id ?? index}>
              {content}
            </Link>
          ) : (
            <article className={`iiic-card ${span}`} key={card.id ?? index}>
              {content}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function FactList({ block }: { block: FactListBlock }) {
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
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

/**
 * What the certificate is and is not (docs/08 §7), in the one wording every certificate and
 * the course page share. Until the lawyer clears the wording it is marked as a draft (I-22).
 */
function Certificate() {
  return (
    <section className="iiic-section" id="certificate">
      <DraftMark what="Draft wording" awaits={CERTIFICATE_AWAITS} />
      <SectionHead heading={CERTIFICATE_HEADING} />
      <div className="iiic-prose">
        {CERTIFICATE_STATEMENT.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>
    </section>
  )
}

function FounderNote({ block }: { block: FounderNoteBlock }) {
  return (
    <section className="iiic-section iiic-split" id={block.anchor ?? undefined}>
      <div className="iiic-image-frame">
        <Todo {...FIXED_PLACEHOLDERS.founderPhoto} />
      </div>
      <div>
        <CandidateMark status={block.copyStatus} />
        {block.kicker ? <div className="iiic-kicker">{renderText(block.kicker)}</div> : null}
        <h2 className={`iiic-marked ${styles.splitHeading}`}>{renderText(block.heading)}</h2>
        <div className="iiic-prose">
          {block.note
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line, index) => (
              <p className={index === 0 ? 'iiic-lede' : undefined} key={line}>
                {renderText(line)}
              </p>
            ))}
        </div>
        {block.attribution ? (
          <p className="iiic-type-small">{renderText(block.attribution)}</p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * IIIC's contact details (D-31), the same as the footer's. The footer's Contact link and the
 * About page's main action open this section by its id. The address prints without a PIN
 * until IIIC confirms it (I-33); the map follows the confirmed address (D-58).
 */
function Contact() {
  return (
    <section className="iiic-section" id="contact">
      <SectionHead heading={CONTACT_HEADING} />
      <address className={styles.contact}>
        <dl className={styles.contactList}>
          <div>
            <dt className="iiic-kicker">Phone</dt>
            <dd>
              <a className="iiic-link" href={telHref(CONTACT.phone)}>
                {CONTACT.phone}
              </a>
            </dd>
          </div>
          <div>
            <dt className="iiic-kicker">Email</dt>
            <dd>
              <a className="iiic-link" href={mailHref(CONTACT.email)}>
                {CONTACT.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="iiic-kicker">Office hours</dt>
            <dd>{CONTACT.hours}</dd>
          </div>
          <div>
            <dt className="iiic-kicker">Address</dt>
            <dd>
              {CONTACT.address} <Todo {...FIXED_PLACEHOLDERS.contactAddress} />
            </dd>
          </div>
        </dl>
      </address>
    </section>
  )
}

/**
 * Who runs the site (docs/08 §4; docs/12 §11): the legal information in the settings, as a
 * table whose rows are headed by their items, so a screen reader reads every detail with its
 * label. A detail the settings lack is its placeholder (src/lib/settings/legal.ts). On a narrow
 * screen the table scrolls inside its region, as the comparison's does.
 */
function LegalInformationSection({ legal }: { legal: LegalInformation }) {
  return (
    <section className="iiic-section" id="legal">
      <SectionHead heading={LEGAL_INFORMATION_HEADING} />
      <div
        className={`iiic-table-wrap ${styles.tableRegion}`}
        role="region"
        aria-label={LEGAL_INFORMATION_HEADING}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region needs keyboard focus
        tabIndex={0}
      >
        <table className="iiic-table">
          <thead>
            <tr>
              <th scope="col">{LEGAL_INFORMATION_COLUMNS.item}</th>
              <th scope="col">{LEGAL_INFORMATION_COLUMNS.detail}</th>
            </tr>
          </thead>
          <tbody>
            {legalRows(legal).map((row) => (
              <tr key={row.item}>
                <th scope="row" className={styles.rowHead}>
                  {row.item}
                </th>
                <td>
                  <strong>{renderText(row.text)}</strong>
                  {row.link ? (
                    <>
                      {' · '}
                      <a className="iiic-link" href={row.link.href}>
                        {row.link.label}
                      </a>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * The questions published for the page (Content → FAQs), in their order, as the kit's accordion:
 * each opens without JavaScript, and its answer is a paragraph a line. With no question
 * published the section is not drawn, and the page's structured data names none (D-62).
 */
function Faq({ block, faqs }: { block: FaqBlock; faqs: readonly FaqItem[] }) {
  if (faqs.length === 0) return null
  return (
    <section className="iiic-section" id={block.anchor ?? undefined}>
      <CandidateMark status={block.copyStatus} />
      <SectionHead kicker={block.kicker} heading={block.heading} intro={block.intro} />
      <div className={styles.faqs}>
        {faqs.map((faq) => (
          <details className="iiic-accordion" key={faq.id}>
            <summary>{faq.question}</summary>
            <div>
              {faq.answer
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
          </details>
        ))}
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
              {/* The Sanskrit is drawn as typed: a placeholder chip inside lang="sa" would mark
                  English as Sanskrit, so the field takes no placeholder (src/blocks/pageBlocks.ts). */}
              {block.sanskrit ? <span lang="sa">{block.sanskrit}</span> : null}
              {block.sanskrit && block.translation ? ' · ' : null}
              {renderText(block.translation)}
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

function Section({
  block,
  draft,
  devices,
  index,
  legal,
  faqs,
  firstVoice,
}: {
  block: Exclude<PageBlock, BandBlock>
  draft: boolean
  devices: Devices
  /** The block's place on its page, which names what a device needs to name. */
  index: number
  legal: LegalInformation
  faqs: readonly FaqItem[]
  firstVoice: PageVoices['first']
}) {
  switch (block.blockType) {
    case 'hero':
      return <Hero block={block} draft={draft} firstVoice={firstVoice} />
    case 'doors':
      return <Doors block={block} />
    case 'statement':
      return <Statement block={block} />
    case 'steps':
      return <Steps block={block} />
    case 'comparison':
      return <Comparison block={block} flip={devices.flip === true} index={index} />
    case 'points':
      return <Points block={block} sticky={devices.stickyQuestion === true} />
    case 'cards':
      // Cards that link somewhere are doors to other pages, not insights to read in turn.
      return devices.chapters && !block.cards.some((card) => card.href) ? (
        <Insights block={block} index={index} />
      ) : (
        <Cards block={block} />
      )
    case 'factList':
      return <FactList block={block} />
    case 'scope':
      return <Scope />
    case 'certificate':
      return <Certificate />
    case 'founderNote':
      return <FounderNote block={block} />
    case 'contact':
      return <Contact />
    case 'legal':
      return <LegalInformationSection legal={legal} />
    case 'faq':
      return <Faq block={block} faqs={faqs} />
  }
}

/**
 * A page's sections in order, in the page column, and its closing band across the window. A
 * legal page that is still a draft says so above its heading (D-52). The page's slug says
 * whether it is a narrative page and which devices it carries (docs/11 §3): on the founders'
 * page every section between the hero and the band is a chapter that reveals once. The legal
 * information section draws what the settings hold (the route reads it,
 * src/lib/settings/read.ts); without it, every detail is its placeholder. The questions section
 * shows the questions given, which PageAt reads for the page (src/lib/content/faqs.ts).
 *
 * The reviews pinned to the page are its voices (docs/11 §3.8; src/lib/proof/read.ts): the
 * home page's first voice under its hero, and one beside each section that has one, by the
 * section's link name; on the counselling page up to three plain cards in the section's text
 * instead. Where nothing is pinned nothing is drawn. A voice reveals once as it comes into view,
 * except inside a chapter, which reveals as a whole, and on counselling, where nothing moves.
 */
export function RenderBlocks({
  layout,
  legalReview,
  slug,
  legal = NO_LEGAL_INFORMATION,
  faqs = [],
  voices = NO_VOICES,
}: {
  layout: PageContent['layout']
  legalReview?: PageContent['legalReview']
  slug?: string
  legal?: LegalInformation
  faqs?: readonly FaqItem[]
  voices?: PageVoices
}) {
  const devices = devicesAt(slug)
  const counselling = isCounsellingPage(slug)
  const band = layout.find((block): block is BandBlock => block.blockType === 'band')
  const sections = layout.filter(
    (block): block is Exclude<PageBlock, BandBlock> => block.blockType !== 'band',
  )
  const voicesOf = (block: Exclude<PageBlock, BandBlock>) => {
    const anchor = 'anchor' in block ? block.anchor : null
    return anchor ? voices.bySection[anchor] : undefined
  }
  const revealsVoices =
    !counselling && !devices.chapters && sections.some((block) => voicesOf(block)?.length)
  return (
    <>
      <div className={`iiic-page ${styles.page}`}>
        {sections.map((block, index) => {
          const drawn = (
            <Section
              block={block}
              draft={legalReview === 'draft'}
              devices={devices}
              index={index}
              legal={legal}
              faqs={faqs}
              firstVoice={slug === 'home' ? voices.first : null}
            />
          )
          const section = counselling ? (
            <PlainVoices section={drawn} voices={voicesOf(block)} key={block.id ?? index} />
          ) : (
            <WithVoice
              section={drawn}
              voice={voicesOf(block)?.[0]}
              reveal={!devices.chapters}
              key={block.id ?? index}
            />
          )
          return devices.chapters && block.blockType !== 'hero' ? (
            <div className={experience.chapter} data-reveal="" key={block.id ?? index}>
              {section}
            </div>
          ) : (
            section
          )
        })}
        {devices.chapters || revealsVoices ? <RevealChapters /> : null}
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

export { Scope }
