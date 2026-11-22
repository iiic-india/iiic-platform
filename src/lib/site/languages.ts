/**
 * The languages a person's messages and a consent text can be in. English at launch (docs/01;
 * docs/08 §3: "English at launch with the language selector ready"); Gujarati and Hindi are the
 * other languages the plan names for families in Gujarat (docs/00, Basics), and which ones IIIC
 * offers per service is I-44. A language here is a choice the records can hold, not a claim
 * that IIIC already offers it.
 */
export const LANGUAGES = [
  { value: 'en-IN', label: 'English' },
  { value: 'gu-IN', label: 'Gujarati' },
  { value: 'hi-IN', label: 'Hindi' },
] as const

export type Language = (typeof LANGUAGES)[number]['value']

export const DEFAULT_LANGUAGE: Language = 'en-IN'

/** A language's name, for labels. */
export function languageLabel(value: unknown): string {
  return LANGUAGES.find((language) => language.value === value)?.label ?? String(value)
}
