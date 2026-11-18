# Verification record

Updated on 17 November 2026 on Windows with Node.js 24.11.1.

| Check | Result |
| --- | --- |
| Production build and TypeScript | Passed |
| Domain, database, account, and origin tests | 36 passed |
| Desktop browser workflows | 5 passed |
| Mobile browser workflows | 5 passed |
| Live Supabase tests | 5 skipped; credentials not supplied |

The application now uses real email/password accounts and server-side persistence. New accounts have empty kitchens. Browser-only demo storage, sample account data, demo banners, and reset-demo controls have been removed.

The embedded PostgreSQL suite applies the actual migration, supplies Auth roles, and verifies row-level ownership, rollback, idempotency, purchase transfer, and deletion cascades. Account tests additionally verify scrypt password checks, opaque sessions, logout, account isolation, and data/session persistence after closing and reopening the database. Origin-validation tests cover the host behind the Next.js proxy and reject foreign/missing origins.

Browser tests use Microsoft Edge with desktop and mobile Chromium contexts and actual signup/login requests. Their database is isolated at `.data/e2e`. The tests cover onboarding, grocery addition/editing, reload persistence, logout/login, meal planning/cooking/eaten logs, shopping transfer, date-specific plans, protected routes, CSRF rejection, account deletion, and login layout overflow. The Playwright server runs the production build.

External services remain unverified: hosted Supabase sessions and email confirmation, Google OAuth, live OpenAI and USDA responses, and Vercel deployment. Five live Supabase tests skip without dedicated test-project credentials. Local persisted accounts work without those credentials. Nutrition coverage remains limited as documented in README; unavailable values are never fabricated.

The local server used for testing is stopped afterward. Start the app with `npm.cmd run dev`.

Initial browser runs exposed an origin-validation mismatch behind the Next.js proxy and controls accepting clicks before hydration. Both were fixed. Browser checks were then run against the production build with cold database startup allowed and assertions that wait for server-saved checkbox state. Login screenshots are in `docs/screenshots/login-desktop.png` and `login-mobile.png`; older dashboard screenshots predate this account-based revision.

Final standalone test run: 36 passed, 5 live-service tests skipped (51.7 seconds). Final production browser run: 10 passed (3.7 minutes), no retries. An earlier database setup timed out while a build ran concurrently; the sequential rerun passed.
