/**
 * A session's device as the devices list names it (docs/20 §4.7): "Chrome on Android", from the
 * browser's user agent alone; never the network address it came from (a session keeps none).
 * The order matters: Edge, Opera and Samsung Internet also say "Chrome", and Chrome also says
 * "Safari". Null when neither the browser nor the system is recognised.
 */
const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const SYSTEMS: readonly [RegExp, string][] = [
  [/\bAndroid\b/, 'Android'],
  [/\biPad\b/, 'iPadOS'],
  [/\biPhone\b|\biPod\b/, 'iOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
]

const first = (list: readonly [RegExp, string][], agent: string) =>
  list.find(([pattern]) => pattern.test(agent))?.[1] ?? null

export function deviceName(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const agent = userAgent.slice(0, 512)
  const browser = first(BROWSERS, agent)
  const system = first(SYSTEMS, agent)
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system
}
