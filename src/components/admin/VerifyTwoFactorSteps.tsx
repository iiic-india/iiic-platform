'use client'

import { useEffect, useRef, useState } from 'react'

import { TOTP_COPY, TWO_FACTOR_COPY as COPY } from '@/plugins/totpCopy'

import { CopyButton } from './CopyButton'
import styles from './TwoFactor.module.css'
import { TwoFactorCodeForm } from './TwoFactorCodeForm'

type Props = {
  /** payload-totp's /api/verify-totp. */
  verifyEndpoint: string
  /** /api/users/recover-two-factor (src/lib/auth/recoveryEndpoints.ts). */
  recoveryEndpoint: string
  /** Where to go once signed in: a path already checked (src/lib/auth/safeBack.ts). */
  next: string
}

/** The key in groups of four, as authenticator apps show it. */
const grouped = (key: string) => key.match(/.{1,4}/g)?.join(' ') ?? key

/**
 * The verify page's steps: the code, or a recovery code behind "Lost your authenticator?". A
 * recovery stores a new secret in the same step, so this then shows it, as a QR code and a key,
 * and a code from the new authenticator finishes the sign-in.
 */
export function VerifyTwoFactorSteps({ verifyEndpoint, recoveryEndpoint, next }: Props) {
  const [fresh, setFresh] = useState<{ secret: string; qr: string }>()
  const heading = useRef<HTMLHeadingElement>(null)

  // The page changes under the person, so focus moves to the new step's heading.
  useEffect(() => {
    if (fresh) heading.current?.focus()
  }, [fresh])

  if (fresh) {
    return (
      <section className={styles.recovery} aria-labelledby="new-authenticator">
        <h2 id="new-authenticator" ref={heading} tabIndex={-1}>
          {COPY.newAuthenticatorHeading}
        </h2>
        <p>{COPY.newAuthenticatorIntro}</p>
        {/* A data URL from the server, so there is nothing for next/image to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.qr} src={fresh.qr} alt={COPY.qrAlt} width={228} height={228} />
        <details className={styles.disclosure}>
          <summary>{TOTP_COPY.setup.addCodeManually}</summary>
          <p>{COPY.setupKeyIntro}</p>
          <div className={styles.key}>
            <code>{grouped(fresh.secret)}</code>
            <CopyButton value={fresh.secret} label={COPY.copyKey} copied={COPY.keyCopied} />
          </div>
        </details>
        <p>{TOTP_COPY.setup.enterCode}</p>
        <TwoFactorCodeForm endpoint={verifyEndpoint} next={next} submitLabel={COPY.verifySubmit} />
      </section>
    )
  }

  return (
    <>
      <TwoFactorCodeForm endpoint={verifyEndpoint} next={next} submitLabel={COPY.verifySubmit} />
      <details className={styles.recovery}>
        <summary>{COPY.lostAuthenticator}</summary>
        <p>{COPY.recoveryIntro}</p>
        <TwoFactorCodeForm
          kind="recovery"
          endpoint={recoveryEndpoint}
          next={next}
          submitLabel={COPY.recoverySubmit}
          buttonStyle="secondary"
          onAccepted={(data) => {
            if (typeof data.secret === 'string' && typeof data.qr === 'string') {
              setFresh({ secret: data.secret, qr: data.qr })
            }
          }}
        />
      </details>
    </>
  )
}
