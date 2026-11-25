// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The secret scan (docs/12 §5; .gitleaks.toml; CI's "Secret scan" step) reads the whole history
// and lets through only the obviously fake values its allowlist names. Every made-up secret in
// the tree that begins with a `<word>-only-` prefix is held here to the allowlist, so that a new
// prefix is named there in the same change (CR-07 of the R2a join), not found by CI after a push.

const ROOT = process.cwd()
const config = readFileSync(join(ROOT, '.gitleaks.toml'), 'utf8')
const allowed = [...config.matchAll(/'''(.+?)'''/g)].map((match) => new RegExp(match[1]!))

/** The tracked folders where a made-up secret can be written down. */
const FOLDERS = ['src', 'tests', '.github']
const TEXT = /\.(?:ts|tsx|mjs|cjs|js|json|ya?ml|md)$/

function filesUnder(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

describe('the secret scan’s allowlist', () => {
  it('names the made-up Release 2 prefixes the history holds', () => {
    for (const value of [
      'int-only-better-auth-secret-00000000000000000',
      'unit-only-better-auth-secret-0000000000000000',
      'print-only-stand-in-secret-never-used-000000',
    ]) {
      expect(
        allowed.some((pattern) => pattern.test(value)),
        value,
      ).toBe(true)
    }
  })

  it(
    'covers every made-up value in the tree that begins with a `<word>-only-` prefix',
    { timeout: 30_000 },
    () => {
      const found = new Set<string>()
      for (const file of [...FOLDERS.flatMap(filesUnder), join(ROOT, '.env.example')]) {
        const text = readFileSync(file, 'utf8')
        // A prefix of one word that starts the value: `fake-secret-for-tests-only-…` is not one.
        for (const match of text.matchAll(/(?<![\w-])[a-z]+-only-[A-Za-z0-9-]{8,}/g)) {
          found.add(match[0])
        }
      }
      expect(found.size).toBeGreaterThan(0)
      const uncovered = [...found].filter(
        (value) => !allowed.some((pattern) => pattern.test(value)),
      )
      expect(uncovered).toEqual([])
    },
  )
})
