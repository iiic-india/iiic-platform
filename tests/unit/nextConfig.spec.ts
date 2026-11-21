// @vitest-environment node
import { withSentryConfig } from '@sentry/nextjs/config'
import { expect, it, vi } from 'vitest'

vi.mock('@payloadcms/next/withPayload', () => ({ withPayload: (config: object) => config }))
vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: vi.fn((config: object) => config) }))

it("keeps Sentry's managed tunnel route out of the build (D-49)", async () => {
  await import('../../next.config')
  expect(vi.mocked(withSentryConfig).mock.calls[0]?.[1]).toMatchObject({ tunnelRoute: false })
})
