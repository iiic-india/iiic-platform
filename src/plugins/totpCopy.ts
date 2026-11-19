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
  fieldDescription: 'Your authenticator app shows a new code each time you sign in.',
  setup: {
    addCodeManually: 'Enter a setup key instead',
    button: 'Set up',
    description:
      'You need an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator. Scan this QR code with it.',
    enterCode: 'Enter the {digits}-digit code your app shows.',
    incorrectCode: 'That code did not match. Enter the newest code from your authenticator app.',
    title: 'Set up two-factor sign-in',
  },
  verify: { title: 'Enter your code' },
}

export function totpCopy() {
  return (config: Config): Config => {
    const translations = { ...config.i18n?.translations } as Record<string, object | undefined>
    translations.en = { ...translations.en, totpPlugin: TOTP_COPY }
    return {
      ...config,
      i18n: {
        ...config.i18n,
        translations: translations as NonNullable<Config['i18n']>['translations'],
      },
    }
  }
}
