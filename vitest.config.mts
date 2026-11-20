import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.spec.{ts,tsx}'], environment: 'jsdom' },
      },
      {
        // Integration tests talk to a real Postgres (DATABASE_URL); CI starts one.
        extends: true,
        test: {
          name: 'int',
          include: ['tests/int/**/*.int.spec.ts'],
          environment: 'node',
          fileParallelism: false,
          // Refuses any database that is not local (tests/helpers/localDatabase.ts).
          setupFiles: ['./tests/int/setup.ts'],
        },
      },
    ],
  },
})
