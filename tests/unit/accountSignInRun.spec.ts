// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { networkFor, ownNetwork, signInRun } from '../helpers/accountSignInRun'

// The end-to-end account specs' run (tests/helpers/accountSignInRun.ts; map step 9 of the R2a
// join): they sign in only with Better Auth's secret and the fixed code, skip without them
// locally and fail without them in CI; CI gives both to the end-to-end step and nothing more;
// and each test sends a network address of its own, so that sign-in's twenty codes an hour per
// network (D-116) are never reached by a run. Fake titles and values only.

const SECRET = 'test-only-better-auth-secret-0000000000000000'

describe('whether a run can sign in to My IIIC', () => {
  it('signs in with a secret of 32 characters or more and a six-digit code', () => {
    expect(signInRun({ BETTER_AUTH_SECRET: SECRET, ACCOUNTS_TEST_CODE: '246810' })).toEqual({
      code: '246810',
      canSignIn: true,
      skip: false,
    })
  })

  it('skips locally without either, so a run without them stays green there', () => {
    for (const env of [
      {},
      { ACCOUNTS_TEST_CODE: '246810' },
      { BETTER_AUTH_SECRET: SECRET },
      { BETTER_AUTH_SECRET: 'too-short', ACCOUNTS_TEST_CODE: '246810' },
      { BETTER_AUTH_SECRET: SECRET, ACCOUNTS_TEST_CODE: '2468' },
    ]) {
      expect(signInRun(env), JSON.stringify(env)).toMatchObject({ canSignIn: false, skip: true })
    }
  })

  it('never skips in CI: without them the account specs fail there (hazard 18)', () => {
    for (const env of [{ CI: 'true' }, { CI: 'true', ACCOUNTS_TEST_CODE: '246810' }]) {
      expect(signInRun(env), JSON.stringify(env)).toMatchObject({ canSignIn: false, skip: false })
    }
  })
})

describe('CI’s end-to-end step', () => {
  const workflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
  const lines = workflow.split('\n')
  const start = lines.findIndex((line) => /^ {6}- name: End-to-end tests/.test(line))
  const end = lines.findIndex((line, index) => index > start && /^ {6}- /.test(line))
  const step = lines.slice(start, end).join('\n')
  const job = lines
    .slice(
      0,
      lines.findIndex((line) => /^ {4}steps:/.test(line)),
    )
    .join('\n')
  const value = (name: string) =>
    step.match(new RegExp(`^ {10}${name}: '?([^'\\n]+)'?$`, 'm'))?.[1] ?? ''

  it('gives the server under test both sign-in variables, on that step alone', () => {
    expect(start).toBeGreaterThan(0)
    expect(step).toMatch(/^ {8}env:$/m)
    const env = {
      CI: 'true',
      BETTER_AUTH_SECRET: value('BETTER_AUTH_SECRET'),
      ACCOUNTS_TEST_CODE: value('ACCOUNTS_TEST_CODE'),
    }
    expect(signInRun(env)).toMatchObject({ canSignIn: true, skip: false })
    // Not the job's: the integration tests set their own secret (tests/int/accountsSignIn).
    expect(job).not.toMatch(/BETTER_AUTH_SECRET|ACCOUNTS_TEST_CODE/)
  })

  it('uses a secret made up for CI, which the secret scan lets through, and no fake sender', () => {
    expect(value('BETTER_AUTH_SECRET')).toMatch(/^ci-only-/)
    const allowlist = readFileSync(join(process.cwd(), '.gitleaks.toml'), 'utf8')
    expect(allowlist).toContain("'''ci-only-[A-Za-z0-9-]+'''")
    // The fake messaging transport would swap the senders of every spec in the run.
    expect(workflow).not.toMatch(/MESSAGING_TRANSPORT/)
  })
})

describe('a test’s own network address', () => {
  const info = (project: string, ...titlePath: string[]) => ({
    project: { name: project } as never,
    titlePath: ['tests/e2e/fake.e2e.spec.ts', ...titlePath],
  })

  it('is in TEST-NET-3, never its network or broadcast address', () => {
    for (let n = 0; n < 500; n += 1) {
      const address = networkFor(info(n % 2 ? 'phone' : 'desktop', 'a describe', `test ${n}`))
      expect(address).toMatch(/^203\.0\.113\.\d{1,3}$/)
      const last = Number(address.split('.')[3])
      expect(last).toBeGreaterThanOrEqual(2)
      expect(last).toBeLessThanOrEqual(251)
    }
  })

  it('is the same for the same test, and spreads tests and projects over many addresses', () => {
    expect(networkFor(info('desktop', 'signing in', 'keeps a device'))).toBe(
      networkFor(info('desktop', 'signing in', 'keeps a device')),
    )
    expect(networkFor(info('desktop', 'signing in', 'keeps a device'))).not.toBe(
      networkFor(info('phone', 'signing in', 'keeps a device')),
    )
    const seen = new Set<string>()
    for (const project of ['desktop', 'phone']) {
      for (let n = 0; n < 30; n += 1) seen.add(networkFor(info(project, 'My IIIC', `test ${n}`)))
    }
    // Sixty tests over more than forty-five addresses: none carries more than a few tests' codes.
    expect(seen.size).toBeGreaterThan(45)
  })

  it('is handed to Playwright as the browser’s x-forwarded-for header', async () => {
    const provide = vi.fn(async () => {})
    const testInfo = info('phone', 'My IIIC', 'cancels a booking')
    await ownNetwork({}, provide, testInfo as never)
    expect(provide).toHaveBeenCalledExactlyOnceWith({ 'x-forwarded-for': networkFor(testInfo) })
  })
})
