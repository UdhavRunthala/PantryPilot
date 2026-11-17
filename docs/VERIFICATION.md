# Verification record

Executed on Windows with Node.js 24.11.1 on 16 November 2026.

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | Passed |
| Domain tests | 20 passed |
| Embedded PostgreSQL migration / RLS / transaction tests | 8 passed |
| Live Supabase integration tests | 5 skipped; no test-project credentials supplied |
| Dependency audit after upgrading Vitest | 0 reported vulnerabilities |
| Production build (`next build --webpack`) | Passed on final source; all routes compiled |
| Desktop/mobile Playwright workflows | 8 passed (4 desktop + 4 mobile), final run 28.5 seconds |

The embedded database suite applies the actual migration after replacing only the unavailable `pgcrypto` extension declaration (PGlite has built-in UUID generation), and supplies a minimal Auth schema and roles. RLS runs as the `authenticated` role with distinct JWT subject settings. This verifies PostgreSQL semantics locally, not Supabase infrastructure or Google OAuth.

Browser tests use real Microsoft Edge with desktop and phone-sized Chromium contexts. They exercise local demo persistence, onboarding, grocery additions, plan generation/save, cooking confirmation, separate eaten logs, shopping purchases, and responsive layout. Initial mobile tests exposed expanding grid columns and an overflowing dialog. Both were corrected, and the regression now compares layout width against the actual device viewport. A run coinciding with an execution-host stall was repeated; the final complete suite passed with no retries. Screenshots are saved in `docs/screenshots/`.

The local preview returned HTTP 200 and was stopped after verification. Restart it with `npm.cmd run dev`. Turbopack failed its worker connection on this host; the checked-in development/build scripts use Webpack and both served/compiled successfully.

External services not verified: Google OAuth, hosted Supabase sessions and concurrent multi-connection transactions, real OpenAI responses, USDA responses, Vercel deployment, and account deletion against a hosted Auth service. Their integration code and setup instructions are present. No deployment or live-cloud success is claimed.
