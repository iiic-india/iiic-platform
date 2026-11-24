import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig, type EmailAdapter } from 'payload'
import { payloadTotp } from 'payload-totp'
import sharp from 'sharp'

import { AnalyticsEvents } from './collections/AnalyticsEvents'
import { AuditLog } from './collections/AuditLog'
import { Automations } from './collections/Automations'
import { AvailabilityExceptions } from './collections/AvailabilityExceptions'
import { AvailabilityRules } from './collections/AvailabilityRules'
import { Bookings } from './collections/Bookings'
import { BusyBlocks } from './collections/BusyBlocks'
import { CalendarConnections } from './collections/CalendarConnections'
import { CaseStudies } from './collections/CaseStudies'
import { Certificates } from './collections/Certificates'
import { Consents } from './collections/Consents'
import { ConsentVersions } from './collections/ConsentVersions'
import { DataRequests } from './collections/DataRequests'
import { Enquiries } from './collections/Enquiries'
import { Events } from './collections/Events'
import { Faqs } from './collections/Faqs'
import { Feedback } from './collections/Feedback'
import { GatewayEvents } from './collections/GatewayEvents'
import { Incidents } from './collections/Incidents'
import { Invoices } from './collections/Invoices'
import { LeadActivities } from './collections/LeadActivities'
import { Leads } from './collections/Leads'
import { Media } from './collections/Media'
import { Messages } from './collections/Messages'
import { MessageTemplates } from './collections/MessageTemplates'
import { MissingPages } from './collections/MissingPages'
import { NewsletterIssues } from './collections/NewsletterIssues'
import { Organisations } from './collections/Organisations'
import { Pages } from './collections/Pages'
import { Payments } from './collections/Payments'
import { People } from './collections/People'
import { Posts } from './collections/Posts'
import { Practitioners } from './collections/Practitioners'
import { PriceHistory } from './collections/PriceHistory'
import { Proposals } from './collections/Proposals'
import { ProposalVersions } from './collections/ProposalVersions'
import { redirects } from './collections/Redirects'
import { Refunds } from './collections/Refunds'
import { Services } from './collections/Services'
import { SessionNotes } from './collections/SessionNotes'
import { StaffRecoveryCodes } from './collections/StaffRecoveryCodes'
import { Subscribers } from './collections/Subscribers'
import { Suppressions } from './collections/Suppressions'
import { Tasks } from './collections/Tasks'
import { Testimonials } from './collections/Testimonials'
import { Topics } from './collections/Topics'
import { Users } from './collections/Users'
import { pipelineEndpoints } from './components/admin/pipeline/moveEndpoint'
import { Settings } from './globals/Settings'
import { jobs } from './jobs'
import { adminViewEndpoints } from './lib/adminViews/endpoints'
import { TOTP_OPTIONS } from './lib/auth/totp'
import { env } from './lib/env'
import { reportServerError, reportTestError } from './lib/monitoring/sentry'
import { auditLog } from './plugins/auditLog'
// M5 A: session notes and privacy (docs/18 §3, §5).
import { notesAndPrivacy } from './plugins/notesAndPrivacy'
import { searchIndex } from './plugins/searchIndex'
import { totpCopy } from './plugins/totpCopy'
import { totpSecretAtRest } from './plugins/totpSecretAtRest'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const config = env()

// Migrations run over Supabase's session pooler (port 5432); the app uses the transaction pooler (port 6543).
// The direct connection is IPv6-only and unreachable from Vercel, so it is never used (.env.example).
const connectionString =
  process.env.PAYLOAD_MIGRATING === 'true'
    ? config.DATABASE_URL_DIRECT || config.DATABASE_URL
    : config.DATABASE_URL

// Email arrives with Resend in M6. Payload's fallback console adapter would log every
// recipient's address, so until then messages are dropped with a note that names no one.
const emailNotConfigured: EmailAdapter = ({ payload }) => ({
  name: 'not-configured',
  defaultFromAddress: 'not-configured@example.invalid',
  defaultFromName: 'IIIC',
  sendEmail: async () => {
    payload.logger.warn('Email is not configured yet (M6); the message was not sent.')
  },
})

/** One of IIIC's two-factor views (src/components/admin/), registered as payload-totp registers its own. */
const twoFactorView = (component: string, path: `/${string}`) => ({
  Component: `/components/admin/${component}#${component}`,
  path,
  exact: true,
  strict: true,
  sensitive: false,
})

export default buildConfig({
  // Only an explicit origin (production with its domain, or local) becomes the server URL;
  // otherwise the admin uses relative URLs, so previews and the vercel.app alias both work.
  ...(config.NEXT_PUBLIC_SITE_URL ? { serverURL: config.NEXT_PUBLIC_SITE_URL } : {}),
  secret: config.PAYLOAD_SECRET,
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' · IIIC admin',
      // IIIC's own tab icon in place of Payload's (src/app/icon.svg, D-48); Next.js links
      // src/app/favicon.ico by itself.
      icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
    },
    importMap: { baseDir: path.resolve(dirname) },
    // No dark mode anywhere, the admin included (CLAUDE.md #2).
    theme: 'light',
    // Payload's default avatar is Gravatar, which would send a hash of each staff email to a
    // third party and break the CSP (img-src 'self').
    avatar: 'default',
    components: {
      // Recovery codes for staff two-factor (src/lib/auth/recoveryEndpoints.ts).
      beforeDashboard: [
        '/components/admin/RecoveryCodes#RecoveryCodes',
        // M5 C: the way to Today, until Today replaces the dashboard (docs/18 §8).
        '/components/admin/views/ViewsNavLinks#TodayLink',
      ],
      // Content → Placeholders: what the pages still wait for (D-56).
      afterNavLinks: [
        '/components/admin/PlaceholdersNavLink#PlaceholdersNavLink',
        // Calendar → Working hours, with the preview of bookable times (docs/05; docs/16 §12).
        '/components/admin/office/WorkingHoursNavLink#WorkingHoursNavLink',
        // The Pipeline board (M4; docs/17 §12 C).
        '/components/admin/pipeline/PipelineNavLink#PipelineNavLink',
        // M5 A: Privacy (docs/18 §6).
        '/components/admin/privacy/PrivacyNavLink#PrivacyNavLink',
        // M5 B: certificates (D-39; docs/18 §4).
        '/components/admin/certificates/CertificatesNavLink#CertificatesNavLink',
        // M5 B end.
        // M5 C: Today, Calendar, Search, Proof, Reports, Settings (docs/18 §6).
        '/components/admin/views/ViewsNavLinks#ViewsNavLinks',
        // M5 C end.
      ],
      // IIIC's own two-factor views replace payload-totp's: same keys and paths, which the
      // plugin spreads after its own, so these win. One labelled code field each; the verify
      // view also takes a recovery code.
      views: {
        SetupTOTP: twoFactorView('SetupTwoFactor', '/setup-totp'),
        SetupTOTPBackslash: twoFactorView('SetupTwoFactor', '/setup-totp'),
        VerifyTOTP: twoFactorView('VerifyTwoFactor', '/verify-totp'),
        VerifyTOTPBackslash: twoFactorView('VerifyTwoFactor', '/verify-totp'),
        // The view checks the user and the role itself (CLAUDE.md #6).
        placeholders: {
          Component: '/components/admin/PlaceholdersView#PlaceholdersView',
          path: '/placeholders',
          exact: true,
        },
        // The view checks the user, the code and the role itself (CLAUDE.md #6).
        workingHours: {
          Component: '/components/admin/office/WorkingHoursView#WorkingHoursView',
          path: '/working-hours',
          exact: true,
        },
        // The Pipeline board (docs/17 §12 C); it checks the user, the role and the code itself.
        pipeline: {
          Component: '/components/admin/pipeline/PipelineView#PipelineView',
          path: '/pipeline',
          exact: true,
        },
        // M5 A: Privacy, which checks the user, the code and the role itself (docs/18 §6).
        privacy: {
          Component: '/components/admin/privacy/PrivacyView#PrivacyView',
          path: '/privacy',
          exact: true,
        },
        // M5 B: Learning → Certificates → Issue (D-39; docs/18 §4). The view checks the user,
        // the code and the role itself, and every route it calls does again (CLAUDE.md #6).
        certificatesIssue: {
          Component: '/components/admin/certificates/CertificatesIssueView#CertificatesIssueView',
          path: '/certificates/issue',
          exact: true,
        },
        // M5 B end.
        // M5 C: the views (docs/18 §6). Each checks the user, the code and the role itself, and
        // its loader asks again before it reads anything (CLAUDE.md #6).
        today: {
          Component: '/components/admin/views/TodayView#TodayView',
          path: '/today',
          exact: true,
        },
        calendar: {
          Component: '/components/admin/views/CalendarView#CalendarView',
          path: '/calendar',
          exact: true,
        },
        reports: {
          Component: '/components/admin/views/ReportsView#ReportsView',
          path: '/reports',
          exact: true,
        },
        search: {
          Component: '/components/admin/views/SearchView#SearchView',
          path: '/search',
          exact: true,
        },
        person: {
          Component: '/components/admin/views/PersonView#PersonView',
          path: '/people/:id',
          exact: true,
        },
        proof: {
          Component: '/components/admin/views/ProofView#ProofView',
          path: '/proof',
          exact: true,
        },
        adminSettings: {
          Component: '/components/admin/views/SettingsView#SettingsView',
          path: '/settings',
          exact: true,
        },
        // M5 C end.
      },
    },
  },
  // The redirects collection comes from Payload's redirects plugin (src/collections/Redirects.ts).
  collections: [
    Users,
    Pages,
    Posts,
    Topics,
    Faqs,
    MissingPages,
    Media,
    Practitioners,
    Services,
    StaffRecoveryCodes,
    AuditLog,
    // The trust layer (docs/04): the one record of a person, the consent ledger and its notices,
    // and the funnel's anonymous events.
    People,
    Consents,
    ConsentVersions,
    AnalyticsEvents,
    // Proof (docs/04 `testimonials`; D-37): reviews, published only with consent.
    Testimonials,
    // Booking and payments (M3; docs/16-booking-and-payments-design.md).
    Bookings,
    Events,
    AvailabilityRules,
    AvailabilityExceptions,
    CalendarConnections,
    BusyBlocks,
    PriceHistory,
    Payments,
    GatewayEvents,
    Refunds,
    Invoices,
    // The pipeline (M4; docs/17-pipeline-design.md).
    Organisations,
    Leads,
    LeadActivities,
    Tasks,
    Enquiries,
    Proposals,
    ProposalVersions,
    // The admin experience (M5; docs/18-admin-experience-design.md): session notes (S3, author
    // only), certificates (D-39), privacy requests and the breach register, feedback and case
    // studies.
    SessionNotes,
    Certificates,
    DataRequests,
    Incidents,
    Feedback,
    CaseStudies,
    // Automations and messaging (M6; docs/19-automations-and-messaging-design.md).
    Messages,
    MessageTemplates,
    Automations,
    Suppressions,
    Subscribers,
    NewsletterIssues,
  ],
  globals: [Settings],
  // Automations (src/jobs/index.ts): never run on their own here.
  jobs,
  editor: lexicalEditor(),
  email: config.RESEND_API_KEY
    ? resendAdapter({
        apiKey: config.RESEND_API_KEY,
        defaultFromAddress: config.EMAIL_FROM_ADDRESS,
        defaultFromName: 'IIIC',
      })
    : emailNotConfigured,
  db: postgresAdapter({
    // A small pool per function instance (docs/12 §4); the statement timeout lives on
    // the database role (src/scripts/db-settings.ts), because the transaction pooler
    // ignores session settings.
    // A request that cannot get a connection within 5 s fails instead of waiting forever:
    // a sign-in holds one connection while it reads the committed deactivation flag on another.
    pool: { connectionString, max: 3, connectionTimeoutMillis: 5_000 },
    migrationDir: path.resolve(dirname, 'migrations'),
    // Schema changes go through migrations in every environment, never push (docs/07).
    push: false,
  }),
  // Only the platform's own origin may call the API with a session cookie.
  csrf: config.allowedOrigins,
  cors: [],
  // The admin uses REST and server functions; GraphQL stays off to keep the surface small.
  graphQL: { disable: true },
  telemetry: false,
  // Uploads pass through the server, so the request must stay under Vercel's 4.5 MB body limit
  // (D-46); images are re-encoded there before they are stored.
  upload: {
    limits: { fileSize: 4 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: 'Choose an image under 4 MB.',
  },
  // The server's own faults go to Sentry, scrubbed (src/lib/monitoring/sentry.ts, D-49); an owner
  // can send a test error to check that reports arrive.
  hooks: { afterError: [reportServerError] },
  // The board's "Move to stage" checks the user, the role and the code first
  // (src/components/admin/pipeline/moveEndpoint.ts).
  endpoints: [
    { path: '/report-test-error', method: 'post', handler: reportTestError },
    ...pipelineEndpoints,
    // M5 C: the audit log's CSV, for an owner with the code (src/lib/adminViews/endpoints.ts).
    ...adminViewEndpoints,
  ],
  plugins: [
    // Media in Cloudflare R2's public bucket (docs/07) once R2 is configured; on the local disk
    // before that (development, CI). Files are served straight from the bucket's public URL.
    s3Storage({
      enabled: Boolean(config.R2_ACCESS_KEY_ID),
      // The same columns with R2 on or off, so CI, local and Vercel share one schema.
      alwaysInsertFields: true,
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) =>
            `${config.R2_PUBLIC_BASE_URL}/${prefix ? `${prefix}/` : ''}${filename}`,
        },
      },
      bucket: config.R2_BUCKET_PUBLIC,
      config: {
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: config.R2_SECRET_ACCESS_KEY ?? '',
        },
      },
    }),
    // Site search's index (docs/11 §5.3, D-34): Payload's search plugin over the published
    // pages, services, articles and questions. Before payload-totp, for the same reason.
    searchIndex(),
    // Old addresses and where they lead (docs/12 §3). Before payload-totp, so that its access
    // rules wait for the two-factor code like every other collection's.
    redirects,
    // Staff two-factor (docs/08 §9). It wraps the access of every collection before it, so it
    // stays the last plugin that adds collections; the two transforms after it only add hooks
    // and replace its English strings.
    payloadTotp(TOTP_OPTIONS),
    totpSecretAtRest({ collection: 'users', previousSecret: config.PAYLOAD_SECRET_PREVIOUS }),
    totpCopy(),
    // M5 A: the privacy collections' rules, the notes and request panels, and their routes
    // (src/plugins/notesAndPrivacy.ts). It adds no collection.
    notesAndPrivacy(),
    // Last, so it sees every collection (src/plugins/auditLog.ts).
    auditLog(),
  ],
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
