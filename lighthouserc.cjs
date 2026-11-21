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
        'http://localhost:3000/founders',
        'http://localhost:3000/counselling',
        'http://localhost:3000/learn',
        'http://localhost:3000/map',
        'http://localhost:3000/about',
        'http://localhost:3000/institute',
        'http://localhost:3000/legal',
        'http://localhost:3000/privacy',
        'http://localhost:3000/terms',
        'http://localhost:3000/refunds',
        'http://localhost:3000/grievance',
        'http://localhost:3000/accessibility',
      ],
      numberOfRuns: 3,
      settings: {
        // Every deployment except the launched production site is noindex on purpose
        // (docs/12 §3, D-50), CI included.
        skipAudits: ['is-crawlable'],
      },
    },
    assert: {
      // Every budget is judged on the median of its own three values, not the best one (D-59).
      // 'median-run' would judge them all on one run picked by first paint, which can be the run
      // with the worst blocking time (/counselling once measured 30, 40 and 202 ms, judged at 202).
      aggregationMethod: 'median',
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        // A page load has no interaction, so INP has no lab value; Total Blocking Time stands in
        // for it, at Lighthouse's own line for a good TBT on its mobile profile (D-59).
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        // The server's part of the 600 ms TTFB budget (D-42, D-59); the network from India is
        // measured on the live site.
        'server-response-time': ['error', { maxNumericValue: 600 }],
        // Transfer sizes, so compressed: JavaScript, CSS and fonts per page.
        'resource-summary:script:size': ['error', { maxNumericValue: 150 * KB }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 40 * KB }],
        'resource-summary:font:size': ['error', { maxNumericValue: 120 * KB }],
        // Images on a first view, together within the 400 KB no single image may pass
        // (docs/12 §2, D-59).
        'resource-summary:image:size': ['error', { maxNumericValue: 400 * KB }],
        // No third-party request until the analytics beacon is added (docs/12 §2).
        'resource-summary:third-party:count': ['error', { maxNumericValue: 0 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
