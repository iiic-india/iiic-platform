/**
 * The feature flags (docs/04 `settings`; docs/12 §8), read on the server; no third-party flag
 * service. Each is off unless the owner turned it on.
 * - `pricesPublic`: prices show on pages, in emails and in templates (D-21: off until IIIC
 *   publishes prices).
 * - `payAtBooking`: a booking takes payment (D-24); it needs the prices published, because the
 *   total is shown before payment (docs/08 §5).
 * - `mapEnabled`, `accountsEnabled`, `bridgesEnabled`: the Map, My IIIC and cross-path bridges
 *   (Release 2).
 */
export const FLAG_NAMES = [
  'pricesPublic',
  'payAtBooking',
  'mapEnabled',
  'accountsEnabled',
  'bridgesEnabled',
] as const

export type FlagName = (typeof FLAG_NAMES)[number]
export type Flags = Record<FlagName, boolean>

export const FLAGS_OFF: Flags = {
  pricesPublic: false,
  payAtBooking: false,
  mapEnabled: false,
  accountsEnabled: false,
  bridgesEnabled: false,
}

/** The flags in the settings as the code reads them: on only when set to true. */
export function toFlags(settings: unknown): Flags {
  const stored = (settings as { flags?: Record<string, unknown> } | null | undefined)?.flags
  const on = (name: FlagName) => stored?.[name] === true
  return {
    pricesPublic: on('pricesPublic'),
    // Never without published prices, whatever is stored (D-21, D-24).
    payAtBooking: on('payAtBooking') && on('pricesPublic'),
    mapEnabled: on('mapEnabled'),
    accountsEnabled: on('accountsEnabled'),
    bridgesEnabled: on('bridgesEnabled'),
  }
}
