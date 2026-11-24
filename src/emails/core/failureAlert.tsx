import { z } from 'zod'

import { ok } from '@/lib/result'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { Frame, Paragraph } from '../components/Frame'
import { Button, Details } from '../components/parts'
import type { EmailTemplate, TemplateImplementation } from '../types'

/**
 * O3 · the failure alert to an owner (docs/06; docs/19 §9), from `platform@` with no reply
 * address. Counts only, read when it is sent: no name, no address, no message body, nothing from
 * counselling. Internal mail, so no withdraw link; the owner turns it off by pausing O3.
 */

const schema = z.object({
  messages: z.number().int().min(0),
  unanswered: z.number().int().min(0),
  jobs: z.number().int().min(0),
  since: z.iso.datetime(),
})
type Data = z.infer<typeof schema>

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** Numbers one to nine in words, 10 and up in figures (src/brand/VOICE.md). */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n)
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function headline(data: Data): string {
  const total = data.messages + data.unanswered + data.jobs
  return `${capitalised(countWord(total))} sends or jobs failed in the last hour`
}

const email: EmailTemplate<Data> = {
  key: 'failure-alert',
  schema,
  subject: headline,
  preheader: () => 'Each one is in the admin with a code saying why.',
  element: (data, context) => {
    const since = new Date(data.since)
    const logUrl = `${context.siteUrl.replace(/\/+$/, '')}/admin/collections/messages`
    return (
      <Frame
        preheader="Each one is in the admin with a code saying why."
        eyebrow="Failure alert"
        heading={headline(data)}
        assetUrl={context.assetUrl}
        footer={context.footer}
      >
        <Paragraph>
          These failed since {formatIstTime(since)}. Each one is in the admin with a code saying
          why; this email holds counts only.
        </Paragraph>
        <Details
          rows={[
            { label: 'Messages that failed', value: String(data.messages) },
            { label: 'Sends with no answer', value: String(data.unanswered) },
            { label: 'Jobs that gave up', value: String(data.jobs) },
            {
              label: 'Counted since',
              value: `${formatIstDate(since)}, ${formatIstTime(since)}`,
            },
          ]}
        />
        <Paragraph>
          Once the cause is fixed, a failed message can be queued again from its row in the message
          log. A send with no answer may have reached the person, so check before queuing it again.
        </Paragraph>
        <Paragraph>This alert goes at most once an hour.</Paragraph>
        <Button href={logUrl}>Open the message log</Button>
      </Frame>
    )
  },
}

export const failureAlert: TemplateImplementation<Data> = {
  load: async (req) => {
    const { failuresInLastHour } = await import('@/lib/automations/failureAlert')
    const now = new Date()
    const counts = await failuresInLastHour(req, now)
    return ok({ ...counts, since: new Date(now.getTime() - 3_600_000).toISOString() })
  },
  email,
}
