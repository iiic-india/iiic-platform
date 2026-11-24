/**
 * The client's invite and the practitioners' private feeds (D-22; docs/16 §7), as contracts the
 * calendar builder implements here with the `ics` library (pinned), never a hand-built file.
 * Times are written in UTC; the invite's text says the time in India as src/brand/VOICE.md writes
 * it. Prices never appear in an invite while prices_public is off (D-21), and nothing said in a
 * session ever does (CLAUDE.md #3).
 */

/** One booking as an `.ics` invite, attached to every confirmation (B2) and change (B7). */
export type InviteInput = {
  /** Stable across changes, so a calendar replaces the event: `<reference>@<platform host>`. */
  uid: string
  /** Raised by one on every change; a cancellation sends METHOD:CANCEL. */
  sequence: number
  method: 'REQUEST' | 'CANCEL'
  start: Date
  end: Date
  title: string
  description: string
  location: string | null
  url: string | null
}

/** Returns the invite's text (text/calendar), or the library's error as a typed failure. */
export type BuildInvite = (
  input: InviteInput,
) => { ok: true; value: string } | { ok: false; error: { code: 'invalid-invite' } }

/**
 * A practitioner's own bookings as a private feed (`/api/calendar/feed/[token]`): the token is
 * 128 random bits shown once, its SHA-256 hash kept on the calendar connection; the feed holds
 * the next horizon's confirmed bookings with first names and references only.
 */
export type BuildFeed = (
  events: readonly Omit<InviteInput, 'method' | 'sequence'>[],
) => { ok: true; value: string } | { ok: false; error: { code: 'invalid-invite' } }
