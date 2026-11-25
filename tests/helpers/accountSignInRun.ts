import type { TestInfo } from '@playwright/test'

/**
 * The parts of the end-to-end account sign-in (tests/helpers/accountSignIn.ts) that depend on the
 * run alone: whether it can sign in, and each test's network address. Free of Playwright's
 * runtime and of the app, so a unit test holds them (tests/unit/accountSignInRun.spec.ts).
 */

/**
 * Whether a run can sign in to My IIIC, from the environment Playwright starts the server with
 * (playwright.config.ts): Better Auth's secret, or sign-in is closed, and the fixed test code
 * (ACCOUNTS_TEST_CODE), or no code can be read. Locally the account specs skip without both; in
 * CI they do not skip, and fail, so that CI never passes without running them (hazard 18 of the
 * R2a join; .github/workflows/ci.yml sets both on the end-to-end step).
 */
export function signInRun(env: Record<string, string | undefined>): {
  code: string
  canSignIn: boolean
  skip: boolean
} {
  const code = env.ACCOUNTS_TEST_CODE ?? ''
  const canSignIn = /^\d{6}$/.test(code) && (env.BETTER_AUTH_SECRET ?? '').length >= 32
  return { code, canSignIn, skip: !canSignIn && !env.CI }
}

/**
 * A network address of its own for each test, from TEST-NET-3 (203.0.113.0/24, kept for
 * documentation), sent as the browser's `x-forwarded-for`. Sign-in counts codes per network,
 * twenty an hour (D-116), and the server under test would otherwise see every request of a run
 * from 127.0.0.1, so the account specs ran into the limit within one run (map step 9.1 of the R2a
 * join). Next keeps a forwarded address the client sends. The same test gets the same address on
 * a retry; the limit itself is never changed for tests.
 */
export function networkFor(testInfo: Pick<TestInfo, 'project' | 'titlePath'>): string {
  // FNV-1a over the project and the test's title path (its file first): 250 addresses, .2 to .251.
  let hash = 2166136261
  for (const char of [testInfo.project.name, ...testInfo.titlePath].join('\u0000')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  }
  return `203.0.113.${(hash % 250) + 2}`
}

/**
 * The fixture for a spec's `test.use({ extraHTTPHeaders: ownNetwork })`. Playwright fills the
 * header into every context a test makes, `browser.newContext()` included.
 */
export const ownNetwork = async (
  {}: object,
  provide: (headers: Record<string, string>) => Promise<void>,
  testInfo: TestInfo,
): Promise<void> => {
  await provide({ 'x-forwarded-for': networkFor(testInfo) })
}
