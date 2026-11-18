# Implementation checklist

## Implemented in source

- [x] Next.js 16 / React 19 App Router, TypeScript, Tailwind 4, Radix dialog, shadcn-style button, Lucide.
- [x] Responsive desktop sidebar, mobile bottom navigation, dashboard, focus states, reduced motion, empty/error states.
- [x] Email/password signup and login, protected page URLs, persistent local PostgreSQL accounts with hashed passwords and HTTP-only sessions.
- [x] Supabase email/password auth and Google OAuth callback, session refresh, authenticated API operations, profile trigger, six-step persisted onboarding.
- [x] Profile editing, optional nutrition consent, sign-out and permanent account-deletion integration.
- [x] Grocery catalog autocomplete, CRUD, quantities, storage, manufacturer/estimated dates, spoilage, low-stock thresholds, search/category filters, history.
- [x] Curated recipe library and structured server-side AI integration with validation/fallback and database rate limiting.
- [x] Deterministic availability, units, hard dietary constraints, expiry ranking, aggregate daily stock reservation.
- [x] Daily plan saving, manual recipe replacement through remove/add, serving sizes, preparation confirmation, separate eaten logging.
- [x] Atomic inventory deduction and history with duplicate-cooking protection; atomic purchased-item transfer.
- [x] Shopping CRUD, quantities, checked purchases, low-stock and plan-shortage suggestions.
- [x] Normalized schema, indexes, RLS, composite owner foreign keys, migrations, setup docs and credential template.
- [x] Unit, opt-in integration, and desktop/mobile browser test suites.

## Partial / deliberately bounded

- Nutrition: deterministic calculation and USDA lookups exist, but full Indian composition coverage and supplementary Indian data are unfinished. Partial totals are withheld. Density and piece weights are estimates, not universally applicable conversions.
- Planner: prioritizes practical, feasible recipes and expiry. It is not yet a whole-day macro optimizer. Budget is stored but shopping cost and budget optimization are unavailable without price data. No protein goal prescription is generated.
- Recipe replacement: remove an unprepared entry and choose from the library; there is no single-slot AI regeneration endpoint. Snacks can be added manually. AI generation currently always uses one serving for initial day plans.
- Plans: both local and Supabase accounts persist multiple dates. Suggested feasibility uses current stock/current freshness, not a forecast for a future date.
- Catalog: 18 reviewed ingredient records, six curated recipes. Custom grocery entries and predictive consumption reminders are intentionally unavailable until metadata/history supports them. General spelling aliases are not supported.
- Inventory lots keep their ingredient and unit fixed in the UI and database function so history deltas stay comparable. Remove and re-add to change the identity or unit.
- Account deletion removes database records via cascades and the Auth account; external provider identity, provider logs, backups, and infrastructure retention are controlled by those services.
- UI recipe photos use remote illustrative Unsplash assets. Offline image fallback is the card background; self-host licensed assets for predictable production delivery.
- No email, push, receipt scanning, barcode recognition, payment, or medical diet support is claimed.

## Required before a real-user pilot

1. Configure staging Supabase, apply migration, and execute the live integration suite, including RLS and concurrent cooking tests.
2. Configure Supabase email delivery and optional Google OAuth and verify new/returning sessions, refresh, sign-out, and deletion in an actual browser.
3. Exercise OpenAI refusal/invalid output/rate limits and USDA live responses with real credentials. Audit FDC IDs, food forms, densities, and allergens with a food-data reviewer; finish Indian food mappings.
4. Add verified nutrition-aware day allocation and honest shortfall messaging, then slot-specific regeneration and multi-day reservations.
5. Add distributed CRUD abuse limits, deployment monitoring without health-data logging, migration CI, backup/retention procedures, and a privacy notice matching the actual deployment.

The immediate next implementation step is to provision a disposable Supabase test project and run the prepared integration suite. Source code presence is not evidence of successful cloud operation.
