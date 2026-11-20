import type { Config } from 'payload'

/**
 * payload-totp's English strings, rewritten to IIIC's interface patterns (src/brand/VOICE.md:
 * sentence case, verb and object, errors that say what happened and what to do). Listed after
 * payloadTotp in the plugins, because that plugin's own strings would otherwise replace these.
 */
export const TOTP_COPY = {
  authApp: 'Authenticator app',
  configured: 'Set up',
  errors: { alreadySet: 'Two-factor is already set up on this account.' },
  fieldDescription: 'Your authenticator app shows a new code every 30 seconds.',
  setup: {
    addCodeManually: 'Enter a setup key instead',
    button: 'Set up',
    description:
      'You need an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator. Scan this QR code with it.',
    enterCode: 'Enter the code your authenticator app shows.',
    incorrectCode: 'That code did not match. Enter the newest code from your authenticator app.',
    title: 'Set up two-factor sign-in',
  },
  verify: { title: 'Enter your code' },
}

/**
 * The strings of IIIC's own two-factor views and the recovery codes (src/components/admin/),
 * which replace the plugin's setup and verify views; same patterns as above.
 */
export const TWO_FACTOR_COPY = {
  codeLabel: 'Code',
  codeFormat: 'Enter the six-digit code from your authenticator app.',
  verifySubmit: 'Sign in',
  setupSubmit: 'Turn on two-factor',
  qrAlt: 'QR code for your authenticator app',
  setupKeyIntro: 'Type this key into your authenticator app instead of scanning the QR code.',
  copyKey: 'Copy key',
  keyCopied: 'Key copied.',
  copyFailed: 'Copying did not work. Select the text and copy it yourself.',
  failed: 'That did not work. Try again.',
  offline: 'That did not go through. Check your connection and try again.',
  locked: 'Too many wrong attempts. Try again in 15 minutes, or ask an owner to lift the lock.',

  // Using a recovery code, on the verify page.
  lostAuthenticator: 'Lost your authenticator?',
  recoveryIntro:
    'Use one of the recovery codes you saved. Each works once, and you then set up a new authenticator.',
  recoveryLabel: 'Recovery code',
  recoveryFormat:
    'Enter a recovery code from your saved list: 16 letters and digits, with or without the dashes.',
  recoverySubmit: 'Use recovery code',
  newAuthenticatorHeading: 'Set up your new authenticator',
  newAuthenticatorIntro:
    'Your recovery code worked, and the lost authenticator no longer counts. Scan this QR code with your authenticator app, then enter the code it shows.',

  // The recovery-codes panel on the dashboard.
  codesHeading: 'Recovery codes',
  codesNone:
    'If you lose your authenticator, a recovery code lets you sign in once and set up a new one. You have none yet.',
  codesSave: 'Save these codes somewhere safe now: they are shown only this once. Each works once.',
  createCodes: 'Create recovery codes',
  createNewCodes: 'Create new codes',
  newCodesHeading: 'Create new codes?',
  newCodesBody:
    'The codes you have now stop working, and you get a new set of 10. Save the new ones before you leave this page.',
  cancel: 'Cancel',
  copyCodes: 'Copy codes',
  codesCopied: 'Codes copied.',
  codesNotCreated: 'No codes were created. Try again.',
}

export function totpCopy() {
  return (config: Config): Config => {
    const translations = { ...config.i18n?.translations } as Record<string, object | undefined>
    const en = translations.en as { error?: object } | undefined
    translations.en = {
      ...en,
      totpPlugin: TOTP_COPY,
      // Payload's lock message, shown for wrong passwords and wrong codes alike.
      error: { ...en?.error, userLocked: TWO_FACTOR_COPY.locked },
    }
    return {
      ...config,
      i18n: {
        ...config.i18n,
        translations: translations as NonNullable<Config['i18n']>['translations'],
      },
    }
  }
}
