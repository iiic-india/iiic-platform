// Lighthouse CI: the lab budgets of docs/12 §2 for public pages, on Lighthouse's throttled
// mobile profile (a mid-range Android on 4G). It runs against the production build in CI;
// a page that misses a budget is reported (D-80). Pages join the list as they are built.
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
        'http://localhost:3000/organisations/organisation-planning',
        'http://localhost:3000/organisations/marketing-and-sales',
        'http://localhost:3000/organisations/brand-positioning',
        'http://localhost:3000/organisations/team-map',
        'http://localhost:3000/founders',
        'http://localhost:3000/counselling',
        'http://localhost:3000/learn',
        'http://localhost:3000/map',
        'http://localhost:3000/journal',
        'http://localhost:3000/search',
        'http://localhost:3000/search?q=framework',
        'http://localhost:3000/proof',
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
      // Every budget is judged on the best of its three runs (D-59). On a shared CI machine noise
      // only adds time, so the fastest run is the best estimate of the page's own cost; the
      // median let one busy runner fail an unchanged page (the home page's blocking time measured
      // 590, 360 and 99 ms on the same code). A real regression slows every run, so it still fails.
      aggregationMethod: 'optimistic',
      // D-80: budgets report as warnings while a part is being built; the hardening pass that closes each milestone makes them failures again.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.95 }],
        'categories:accessibility': ['warn', { minScore: 1 }],
        'categories:best-practices': ['warn', { minScore: 1 }],
        'categories:seo': ['warn', { minScore: 1 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.05 }],
        // A page load has no interaction, so INP has no lab value; Total Blocking Time stands in
        // for it, at Lighthouse's own line for a good TBT on its mobile profile (D-59).
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
        // The server's part of the 600 ms TTFB budget (D-42, D-59); the network from India is
        // measured on the live site.
        'server-response-time': ['warn', { maxNumericValue: 600 }],
        // Transfer sizes, so compressed: JavaScript, CSS and fonts per page. React and Next.js's
        // own runtime is about 125 KB of the JavaScript on every page (D-79).
        'resource-summary:script:size': ['warn', { maxNumericValue: 170 * KB }],
        'resource-summary:stylesheet:size': ['warn', { maxNumericValue: 40 * KB }],
        'resource-summary:font:size': ['warn', { maxNumericValue: 120 * KB }],
        // Images on a first view, together within the 400 KB no single image may pass
        // (docs/12 §2, D-59).
        'resource-summary:image:size': ['warn', { maxNumericValue: 400 * KB }],
        // No third-party request until the analytics beacon is added (docs/12 §2).
        'resource-summary:third-party:count': ['warn', { maxNumericValue: 0 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
}
