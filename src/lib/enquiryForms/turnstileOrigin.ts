/**
 * Where Cloudflare Turnstile is served from (docs/08 §9): the widget's script, which the forms
 * load only where both keys are set, and the origin the page's policy then allows. Apart from
 * src/lib/enquiryForms/turnstile.ts so that the widget's client code carries nothing else.
 */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/** Rendered explicitly, so that a form drawn again draws its check again. */
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`
