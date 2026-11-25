import { expect, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import { signInRun } from './accountSignInRun'
import { assertLocalDatabase } from './localDatabase'
import { ACCOUNT_COPY, LOGIN_COPY, VERIFY_COPY } from '../../src/lib/accounts/signIn/copy'
import config from '../../src/payload.config'

/**
 * Signing in to My IIIC in the end-to-end tests (docs/20 §4.1, §11), one helper for the three
 * account specs (tests/e2e/accountsSignIn, myIiic and myIiicPrivacy), beside the staff's login.ts.
 * It follows slice A's own words (src/lib/accounts/signIn/copy.ts, which reaches no stylesheet),
 * signs in with the fixed test code (ACCOUNTS_TEST_CODE: CI and local runs only, refused on every
 * Vercel deployment by src/lib/env.ts), puts one fake account notice in force, and refuses any
 * database that is not local before it writes anything (tests/helpers/localDatabase.ts), as the
 * staff and booking seeds do. Every address and name it is given is obviously fake.
 */

const RUN = signInRun(process.env)

/** The fixed code the server under test accepts for an email address, or '' without one. */
export const TEST_CODE = RUN.code

/**
 * The account specs skip without the code and Better Auth's secret locally, and fail without
 * them in CI (`openMyIiicForTests` throws there), so that CI never passes without running them.
 */
export const SKIP_ACCOUNT_SPECS = RUN.skip
export const SKIP_REASON =
  'Needs BETTER_AUTH_SECRET and ACCOUNTS_TEST_CODE for the server under test (docs/20 §11).'

/**
 * The one fake account notice the three specs make accounts under (I-65's stand-in). The newest
 * notice in force is the one the account step shows (src/lib/privacy/consents.ts), and each spec
 * finds its box by this text, so all three share it.
 */
export const FAKE_ACCOUNT_NOTICE =
  'Fake account notice for end-to-end tests: keep my My IIIC account.'

let cached: Payload | null = null

async function cms(): Promise<Payload> {
  assertLocalDatabase()
  cached ??= await getPayload({ config })
  return cached
}

/** The account notice in force now, as the account step reads it. */
async function noticeInForce(db: Payload) {
  const { docs } = await db.find({
    collection: 'consent-versions',
    where: {
      and: [
        { purpose: { equals: 'account' } },
        { language: { equals: 'en-IN' } },
        { effectiveFrom: { less_than_equal: new Date().toISOString() } },
      ],
    },
    sort: ['-effectiveFrom', '-version'],
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

/** Switches `accountsEnabled`, writing that flag alone over the flags as they are now. */
async function setAccountsEnabled(db: Payload, on: boolean): Promise<void> {
  const settings = await db.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
  await db.updateGlobal({
    slug: 'settings',
    data: { flags: { ...(settings.flags ?? {}), accountsEnabled: on } },
    overrideAccess: true,
  })
}

/**
 * Before a spec signs anyone in: My IIIC switched on, and the shared fake notice in force. When
 * the notice in force is another (an integration test's, an earlier run's), one with the shared
 * text is put in force, dated just before now; otherwise nothing is written. Notices in force are
 * kept for good, as every test that writes one keeps them. Returns the flag as it was, for
 * `restoreMyIiic`. In CI it throws when the run cannot sign in.
 */
export async function openMyIiicForTests(): Promise<boolean> {
  if (!RUN.canSignIn) {
    throw new Error(
      `${SKIP_REASON} Set both on the end-to-end step of .github/workflows/ci.yml; CI does not skip these specs.`,
    )
  }
  const db = await cms()
  const settings = await db.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
  const wasOn = settings.flags?.accountsEnabled === true
  if (!wasOn) await setAccountsEnabled(db, true)
  if ((await noticeInForce(db))?.text !== FAKE_ACCOUNT_NOTICE) {
    await db.create({
      collection: 'consent-versions',
      data: {
        purpose: 'account',
        language: 'en-IN',
        text: FAKE_ACCOUNT_NOTICE,
        effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
        effectiveFrom_tz: 'Asia/Kolkata',
      } as never,
      overrideAccess: true,
    })
  }
  return wasOn
}

/** After a spec: `accountsEnabled` as it was before `openMyIiicForTests`. */
export async function restoreMyIiic(wasOn: boolean | null): Promise<void> {
  if (wasOn === null) return
  await setAccountsEnabled(await cms(), wasOn)
}

/** A network address of its own for each test: tests/helpers/accountSignInRun.ts. */
export { ownNetwork } from './accountSignInRun'

/**
 * Step 1: the address, then "Send me a code"; on the code step. With `keyboard`, by the keyboard
 * alone: focus the field, type, press Enter.
 */
export async function askForCode(
  page: Page,
  email: string,
  options: { keyboard?: boolean } = {},
): Promise<void> {
  await page.goto('/login')
  const form = page.getByRole('form', { name: LOGIN_COPY.emailButton })
  if (options.keyboard) {
    await form.getByLabel(LOGIN_COPY.emailLabel).focus()
    await page.keyboard.type(email)
    await page.keyboard.press('Enter')
  } else {
    await form.getByLabel(LOGIN_COPY.emailLabel).fill(email)
    await form.getByRole('button', { name: LOGIN_COPY.emailButton }).click()
  }
  await expect(page).toHaveURL(/\/login\/verify$/)
}

/**
 * Step 2: the fixed code, with "keep me signed in" ticked only when asked; then either My IIIC
 * (an address with an account) or the account step (a new one). Never "any h1": the code step
 * has one of its own.
 */
export async function enterCode(
  page: Page,
  options: { keep?: boolean } = {},
): Promise<'signed-in' | 'account-step'> {
  const form = page.getByRole('form', { name: VERIFY_COPY.heading })
  await form.getByLabel(VERIFY_COPY.codeLabel).fill(TEST_CODE)
  const keep = form.getByRole('checkbox', { name: VERIFY_COPY.trust })
  await expect(keep).not.toBeChecked()
  if (options.keep) await keep.check()
  await form.getByRole('button', { name: VERIFY_COPY.submit, exact: true }).click()
  const accountStep = page.getByRole('heading', { level: 1, name: ACCOUNT_COPY.heading })
  const landed = async (): Promise<'signed-in' | 'account-step' | null> => {
    if (new URL(page.url()).pathname === '/account') return 'signed-in'
    return (await accountStep.isVisible()) ? 'account-step' : null
  }
  await expect
    .poll(landed, { message: 'neither My IIIC nor the account step after the code' })
    .not.toBeNull()
  return (await landed()) ?? 'signed-in'
}

/**
 * Step 3, for a new address: the name (filled when the page offers none: a fresh address has
 * none to suggest, and an empty name is refused), both boxes ticked here and never before (no
 * box is ticked in advance: docs/20 §4.1; CLAUDE.md #9), then "Create my account"; on My IIIC.
 */
export async function makeAccount(page: Page, options: { name?: string } = {}): Promise<void> {
  const form = page.getByRole('form', { name: ACCOUNT_COPY.heading })
  const name = form.getByLabel(ACCOUNT_COPY.nameLabel)
  if (!(await name.inputValue()).trim()) await name.fill(options.name ?? 'Example Client')
  for (const box of [
    form.getByRole('checkbox', { name: FAKE_ACCOUNT_NOTICE }),
    form.getByRole('checkbox', { name: ACCOUNT_COPY.adult }),
  ]) {
    await expect(box).not.toBeChecked()
    await box.check()
  }
  await form.getByRole('button', { name: ACCOUNT_COPY.create, exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
}

/** Signs an address in by email code, making its account when it has none; on /account. */
export async function signIn(
  page: Page,
  email: string,
  options: { keep?: boolean; name?: string } = {},
): Promise<'signed-in' | 'account-step'> {
  await askForCode(page, email)
  const landed = await enterCode(page, options)
  if (landed === 'account-step') await makeAccount(page, options)
  return landed
}
