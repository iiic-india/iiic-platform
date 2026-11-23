import type {
  CreateVersion,
  ExpireProposals,
  OpenTrackedLink,
  PreviewProposal,
  PrintVersion,
  RecordAnswer,
  SendVersion,
} from '../proposals'

import { makeRecordAnswer, makeWithdrawLink, type WithdrawLink } from './answer'
import type { ProposalDeps } from './deps'
import { makeExpireProposals } from './expire'
import { makePreviewProposal, makePrintVersion } from './preview'
import { makeSendVersion } from './send'
import { makeOpenTrackedLink, readTrackedLink } from './track'
import { makeCreateVersion } from './versions'

/** The proposal actions (src/lib/pipeline/proposals.ts), built on one set of dependencies. */
export type Proposals = {
  createVersion: CreateVersion
  preview: PreviewProposal
  print: PrintVersion
  send: SendVersion
  open: OpenTrackedLink
  read: (
    req: Parameters<OpenTrackedLink>[0],
    token: string,
  ) => ReturnType<typeof readTrackedLink>
  answer: RecordAnswer
  withdraw: WithdrawLink
  expire: ExpireProposals
}

export function makeProposals(deps: ProposalDeps): Proposals {
  return {
    createVersion: makeCreateVersion(deps),
    preview: makePreviewProposal(deps),
    print: makePrintVersion(deps),
    send: makeSendVersion(deps),
    open: makeOpenTrackedLink(deps),
    read: (req, token) => readTrackedLink(req, token, deps),
    answer: makeRecordAnswer(deps),
    withdraw: makeWithdrawLink(deps),
    expire: makeExpireProposals(deps),
  }
}
