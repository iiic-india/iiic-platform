// Lighthouse CI: the lab budgets of docs/12 §2 for public pages, on Lighthouse's throttled
// mobile profile (a mid-range Android on 4G). It runs against the production build in CI;
// a page that misses a budget fails the pull request. Pages join the list as they are built.
const KB = 1024

module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm start',
      startServerReadyPattern: 'Ready',
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/framework',
        'http://localhost:3000/organisations',
        'http://localhost:3000/counselling',
        'http://localhost:3000/learn',
        'http://localhost:3000/map',
        'http://localhost:3000/about',
        // The legal pages share one template; the longest stands for them.
        'http://localhost:3000/privacy',
      ],
      numberOfRuns: 3,
      settings: {
        // Every deployment except the launched production site is noindex on purpose
        // (docs/12 §3, D-50), CI included.
        skipAudits: ['is-crawlable'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        // Transfer sizes, so compressed: JavaScript, CSS and fonts per page.
        'resource-summary:script:size': ['error', { maxNumericValue: 150 * KB }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 40 * KB }],
        'resource-summary:font:size': ['error', { maxNumericValue: 120 * KB }],
        // No third-party request until the analytics beacon is added (docs/12 §2).
        'resource-summary:third-party:count': ['error', { maxNumericValue: 0 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
