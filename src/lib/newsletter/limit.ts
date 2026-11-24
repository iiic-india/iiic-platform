/**
 * A fixed-window limit on the newsletter's public forms (docs/19 §8; docs/12 §6), kept in the
 * function instance's memory: a burst from one address is refused before anything is looked up.
 * It is a first line only (each instance counts on its own): the signup also checks Turnstile
 * where its keys are set and a count the database keeps (src/lib/newsletter/signupGuard.ts), and
 * its own rule sends one email per address per two minutes whatever the limits let through.
 * The key is a hash of the client's address, never the address. Pure apart from its map.
 */
export class WindowLimit {
  private readonly hits = new Map<string, { start: number; count: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Entries kept before the old ones are cleared, so the map stays small. */
    private readonly keep = 5_000,
  ) {}

  /** Counts one try for the key; false once the key has had `max` in its window. */
  take(key: string, now: number): boolean {
    const entry = this.hits.get(key)
    if (!entry || now - entry.start >= this.windowMs) {
      if (this.hits.size >= this.keep) this.sweep(now)
      this.hits.set(key, { start: now, count: 1 })
      return true
    }
    if (entry.count >= this.max) return false
    entry.count += 1
    return true
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) {
      if (now - entry.start >= this.windowMs) this.hits.delete(key)
    }
    // Still full of live windows: start again rather than grow without bound.
    if (this.hits.size >= this.keep) this.hits.clear()
  }
}
