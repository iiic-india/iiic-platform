import { signInAgainAction } from '@/lib/accounts/privacy/actions'
import { REQUEST_COPY } from '@/lib/accounts/privacy/copy'

/**
 * "Sign in again", before a copy, an erasure or closing (D-121): a form, so it works without
 * JavaScript; the action sends a session older than ten minutes to sign in again and brings the
 * person back to where they were.
 */
export function SignInAgain({ back }: { back: 'requests' | 'close' }) {
  return (
    <form action={signInAgainAction}>
      <input type="hidden" name="back" value={back} />
      <button className="iiic-btn iiic-btn-secondary" type="submit">
        {REQUEST_COPY.signInAgain}
      </button>
    </form>
  )
}
