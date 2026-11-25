import { signOutOfMyIiic } from '@/lib/accounts/signIn/actions'
import { SIGN_OUT_COPY } from '@/lib/accounts/signIn/copy'

/**
 * "Sign out", for every My IIIC page (docs/20 §4.7; the `(account)` layout places it): a form
 * that posts to a server action, so it works without JavaScript. It ends this session and clears
 * its cookies, then goes to the home page.
 */
export function SignOutButton({ className = 'iiic-btn iiic-btn-outline' }: { className?: string }) {
  return (
    <form action={signOutOfMyIiic}>
      <button className={className} type="submit">
        {SIGN_OUT_COPY.button}
      </button>
    </form>
  )
}
