import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, Pill } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import { LEAD_KINDS, type LeadKind, REASON_STAGES } from '@/lib/pipeline/stages'
import type { LeadHeat } from '@/lib/pipeline/staleness'
import { formatIstDate } from '@/lib/time/ist'

import { ACTIVE_LIMIT, type BoardCard, FINAL_LIMIT, loadBoard, stageLabel } from './board'
import { BOARD_COPY as COPY } from './copy'
import { FocusMoved } from './FocusMoved'
import { MoveToStage } from './MoveToStage'
import styles from './Pipeline.module.css'

const KINDS = LEAD_KINDS.map(({ value }) => value)

const kindOf = (value: unknown): LeadKind =>
  typeof value === 'string' && (KINDS as string[]).includes(value)
    ? (value as LeadKind)
    : 'consultancy'

const cardId = (id: number) => `lead-${id}`

/** A lead's heat in words, on Payload's own pill (docs/17 §7). */
function HeatPill({ heat }: { heat: LeadHeat }) {
  if (heat.state === 'untouched') {
    return (
      <Pill pillStyle={heat.level === 'red' ? 'error' : 'warning'} size="small">
        {COPY.heat[heat.level]}
      </Pill>
    )
  }
  if (heat.state === 'stale') {
    return (
      <Pill pillStyle="warning" size="small">
        {COPY.heat.stale(formatIstDate(heat.since))}
      </Pill>
    )
  }
  return null
}

function Card({ card, adminRoute }: { card: BoardCard; adminRoute: string }) {
  const titleId = `${cardId(card.id)}-title`
  const title = card.title || COPY.untitled
  return (
    <article aria-labelledby={titleId} className={styles.card} id={cardId(card.id)} tabIndex={-1}>
      <h3 className={styles.cardTitle} id={titleId}>
        <Link href={`${adminRoute}/collections/leads/${card.id}`}>{title}</Link>
      </h3>
      {card.heat.state !== 'fine' ? (
        <p className={styles.pills}>
          <HeatPill heat={card.heat} />
        </p>
      ) : null}
      <dl className={styles.facts}>
        {card.organisationName ? (
          <div>
            <dt>{COPY.organisation}</dt>
            <dd>{card.organisationName}</dd>
          </div>
        ) : null}
        <div>
          <dt>{COPY.owner}</dt>
          <dd>{card.ownerName ?? COPY.nobody}</dd>
        </div>
        {card.nextAction ? (
          <div>
            <dt>{COPY.nextAction}</dt>
            <dd>
              {card.nextAction}
              {card.dueOn
                ? `, ${COPY.due} ${formatIstDate(new Date(`${card.dueOn}T12:00:00+05:30`))}`
                : ''}
            </dd>
          </div>
        ) : null}
      </dl>
      {card.moves.length > 0 ? (
        <MoveToStage
          kind={card.kind}
          leadId={card.id}
          moves={card.moves.map((stage) => ({ value: stage, label: stageLabel(stage) }))}
          reasonStages={[...REASON_STAGES]}
        />
      ) : (
        <p className={styles.hint}>{COPY.move.final}</p>
      )}
    </article>
  )
}

/**
 * Pipeline (docs/05 Pipeline; docs/17 §3, §7, §12 C): a board per kind, its stages as headed
 * lists of cards, the "Needs attention" list of untouched and stale leads first, and "Move to
 * stage" on every card that can still move. Plain and accessible on Payload's own components;
 * drag and drop is the later interface pass's (D-78), with this form kept as the keyboard path.
 * A custom view is public unless it checks for itself (CLAUDE.md #6): no one sees it without a
 * staff sign-in and the two-factor code, and the board is read only for owners and operators,
 * with their own access.
 */
export async function PipelineView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const {
    routes: { admin: adminRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user
  if (!user) redirect(`${serverURL}${adminRoute}/login`)
  if ((user as { _strategy?: string })._strategy !== 'totp') redirect(`${serverURL}${adminRoute}`)

  const allowed = isActive(user) && hasRole(user, ...POLICY.leads.read.roles)
  const kind = kindOf(searchParams?.kind)
  const board = allowed ? await loadBoard(req, kind, new Date()) : null
  const movedId = Number(searchParams?.moved)
  const moved = board?.columns.flatMap((column) => column.cards).find((card) => card.id === movedId)

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>
          {COPY.title}
          {board ? ` · ${COPY.board[kind]}` : ''}
        </h1>
        {board ? (
          <>
            <p className={styles.intro}>{COPY.intro}</p>
            <nav aria-label={COPY.boards}>
              <ul className={styles.boards}>
                {KINDS.map((value) => (
                  <li key={value}>
                    <Link
                      aria-current={value === kind ? 'page' : undefined}
                      href={`${adminRoute}/pipeline?kind=${value}`}
                    >
                      {COPY.board[value]}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <section aria-labelledby="pipeline-attention" className={styles.section}>
              <h2 id="pipeline-attention">
                {COPY.needsAttention} ({board.attention.length})
              </h2>
              {board.attention.length === 0 ? (
                <p>{COPY.needsAttentionNone}</p>
              ) : (
                <ul className={styles.attention}>
                  {board.attention.map((card) => (
                    <li key={card.id}>
                      <a href={`#${cardId(card.id)}`}>{card.title || COPY.untitled}</a>
                      <span>{stageLabel(card.stage)}</span>
                      <HeatPill heat={card.heat} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {board.truncated ? <p className={styles.note}>{COPY.truncated(ACTIVE_LIMIT)}</p> : null}

            <div className={styles.columns}>
              {board.columns.map((column) => {
                const headingId = `pipeline-stage-${column.stage}`
                return (
                  <section aria-labelledby={headingId} className={styles.column} key={column.stage}>
                    <h2 className={styles.columnHeading} id={headingId}>
                      {column.label}
                    </h2>
                    <p className={styles.note}>
                      {COPY.count(column.cards.length)}
                      {column.final && column.cards.length >= FINAL_LIMIT
                        ? ` ${COPY.finalNote(FINAL_LIMIT)}`
                        : ''}
                    </p>
                    {column.cards.length === 0 ? (
                      <p className={styles.hint}>{COPY.emptyColumn}</p>
                    ) : (
                      <ul className={styles.cards}>
                        {column.cards.map((card) => (
                          <li key={card.id}>
                            <Card adminRoute={adminRoute} card={card} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
            <FocusMoved
              cardId={moved ? cardId(moved.id) : null}
              message={
                moved
                  ? COPY.move.moved(moved.title || COPY.untitled, stageLabel(moved.stage))
                  : null
              }
            />
          </>
        ) : (
          <p>{COPY.notAllowed}</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
