import type { ReactNode } from 'react'

import styles from '@/components/account/account.module.css'
import { AccountNav } from '@/components/account/AccountNav'
import navStyles from '@/components/account/AccountNav.module.css'
import { NAV_COPY } from '@/components/account/copy'
import { SiteFrame } from '@/components/site/SiteFrame'
import { getAccountSession } from '@/lib/accounts/scope'

import { signOutAction } from './account/actions'

/**
 * My IIIC's frame (docs/20 §5): the site's frame in the default register, and for a signed-in
 * person the section links (Overview · Bookings · Documents · Invoices · Privacy) and "Sign out"
 * (docs/20 §4.7). No experience device (docs/11), no bridge, no analytics beacon (docs/20 §8).
 * While `accountsEnabled` is off, or for nobody signed in, the bar is not drawn: the session is
 * null then, since it reads the flag fresh itself (src/lib/accounts/session.ts), and each page
 * checks the flag and the session before it reads anything (src/lib/accounts/scope.ts), and
 * answers with the 404 or the way to sign in.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await getAccountSession()
  return (
    <SiteFrame>
      {session ? (
        <div className={`iiic-page ${styles.bar}`}>
          <div className={navStyles.bar}>
            <AccountNav />
            <form className={navStyles.signOut} action={signOutAction}>
              <button className="iiic-btn iiic-btn-outline" type="submit">
                {NAV_COPY.signOut}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {children}
    </SiteFrame>
  )
}
