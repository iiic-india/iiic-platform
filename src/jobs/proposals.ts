import type { JobsConfig, TaskConfig } from 'payload'

/**
 * The proposals' tasks (docs/17 §12, builder C), each named by its automation ID and idempotent
 * (CLAUDE.md): `P8-expire-proposals` (a sent or viewed proposal past its "valid until" day with no
 * answer; P8 is proposed, docs/17 §10). The proposal email is sent by the send itself (docs/17
 * §5), not by a job. Its slug joins the jobs table's enum, so the merge's one migration covers it
 * (docs/17 §12).
 *
 * Nothing runs it on its own yet: Payload's autoRun is never used on Vercel (CLAUDE.md); M6's
 * cron runner queues it daily, after midnight in India, and until then an owner runs it through
 * the jobs API. A proposal past its day is also expired when an action or its link next reads it,
 * so a late run changes only when the office sees it. The proposal actions are loaded when the
 * task runs, as the payments' tasks load theirs.
 */

export const expireProposalsTask: TaskConfig<{ input: object; output: { expired: number } }> = {
  slug: 'P8-expire-proposals',
  label: 'P8 · Mark proposals past their last valid day as expired',
  // docs/06, Engine rules: three attempts, then the job fails where the team sees it.
  retries: 3,
  outputSchema: [{ name: 'expired', type: 'number', required: true }],
  handler: async ({ req }) => {
    const { proposals } = await import('@/lib/pipeline/proposal/wiring')
    const expired = await proposals().expire(req, new Date())
    return { output: { expired } }
  },
}

export const proposalTasks: NonNullable<JobsConfig['tasks']> = [expireProposalsTask]
