import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import jsxA11y from 'eslint-plugin-jsx-a11y'

// docs/12 §8: next, jsx-a11y and @typescript-eslint recommended rules, import order enforced.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: jsxA11y.flatConfigs.recommended.rules },
  {
    rules: {
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [
            { pattern: '@/**', group: 'internal' },
            { pattern: '@payload-config', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // The kit's choice card holds its text three elements deep (label, span, strong), one
      // deeper than the rule looks by default.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
    },
  },
  globalIgnores([
    '.next/**',
    // Claude Code's parallel checkouts, which are not part of this repository's tree.
    '.claude/**',
    'node_modules/**',
    'src/brand/**',
    'src/payload-types.ts',
    'src/migrations/**',
    'src/app/(payload)/**',
    'next-env.d.ts',
    // A CommonJS tool config, outside the file types Next's preset sets the plugins up for.
    'lighthouserc.cjs',
    'playwright-report/**',
    'test-results/**',
  ]),
])
