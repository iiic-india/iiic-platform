/**
 * A typed outcome instead of a thrown string (CLAUDE.md, Conventions): the booking, payment and
 * calendar modules return one of these, so a caller must look at the failure's `code` before it
 * can use the value. Thrown errors stay for faults (the database is down), not for answers (the
 * slot was taken).
 */
export type Ok<T> = { ok: true; value: T }
export type Err<E extends { code: string }> = { ok: false; error: E }
export type Result<T, E extends { code: string }> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E extends { code: string }>(error: E): Err<E> => ({ ok: false, error })
