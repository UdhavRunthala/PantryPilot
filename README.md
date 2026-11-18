# PantryPilot

A responsive Next.js App Router MVP for kitchen inventory, meal planning, and grocery shopping. Built with TypeScript, Tailwind CSS, shadcn-style Radix components, Lucide icons, Zod, and Supabase.

## Run locally

Requires Node.js 22.12+ (developed with Node 24).

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open http://127.0.0.1:3000, choose **Create an account**, and complete onboarding. New accounts start with an empty kitchen. Email/password accounts, groceries, plans, shopping lists, and preferences persist in a server-side PostgreSQL database at `.data/pantrypilot`. No external credentials are required for local use. Passwords are salted and hashed with scrypt; sessions use HTTP-only cookies and server-side revocation.

Keep the data directory to retain accounts across restarts. `PANTRYPILOT_DATA_DIR` can select another persistent directory. Run one app process per local database directory. This embedded database is for a persistent Node server, not serverless hosting or multiple replicas. Local accounts do not include email verification or password recovery. Switching to Supabase starts a separate account/data store; local data is not automatically migrated.

## Configure Supabase for hosted accounts

1. Create a Supabase project. Run `supabase/migrations/001_initial.sql` using the SQL editor, or link the Supabase CLI and run `supabase db push`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
3. Optionally enable Google in Supabase Authentication → Providers. Create Google OAuth credentials, using the Supabase callback URL shown in that provider's setup panel as the Google authorized redirect URI.
4. Set Supabase Authentication Site URL to your application URL. Allow `http://localhost:3000/auth/callback` and the exact production `/auth/callback` URL under redirect URLs. Set `NEXT_PUBLIC_APP_URL` to the same app origin.
5. Set `SUPABASE_SERVICE_ROLE_KEY` **on the server only**, to enable account deletion. No ordinary operation uses this key.
6. Enable email/password authentication (and configure confirmation email delivery), then restart the app. Sign up with email/password or the optional Google button, complete onboarding, then add groceries. New real accounts start empty. The auth trigger creates the profile; foreign keys cascade personal-data deletion.

Never prefix secret variables with `NEXT_PUBLIC_`. Do not commit `.env.local`. A missing service-role key disables account deletion with an explicit error rather than pretending it succeeded.

## AI and food composition

Set `OPENAI_API_KEY`, optionally `OPENAI_MODEL` (default `gpt-4.1-mini`), and `USDA_API_KEY`. Requests run only on the server. The OpenAI Responses API receives a strict JSON schema generated from Zod. Returned data is parsed and checked against known ingredient IDs, compatible units, diet, allergies, equipment, and time. Failed, refused, rate-limited, or unsafe generations fall back to the curated Indian recipe library. A database-backed limiter allows ten AI attempts per user per UTC hour.

The catalog deliberately excludes ambiguous custom ingredients from recipe generation. Recognized allergies match deterministic metadata. Unrecognized allergies/exclusions stop recommendations. This checks ingredient constraints, not manufacturing cross-contact or the safety of AI-authored cooking prose. Users must check labels and handling instructions.

USDA composition lookups are cached for 24 hours. Calories, protein, carbohydrates, and fat are calculated from ingredient amounts, never accepted from the language model. Volume conversion requires a documented density and pieces require a unit weight. **Incomplete composition data produces an unavailable value, not a zero or fabricated total.** Several Indian ingredients (including paneer, poha, and besan) have no reviewed mapping yet; complete macro totals for these meals are not currently available. An Indian supplementary dataset is not yet integrated. Photos are illustrative serving inspiration from Unsplash, not exact recipe photographs.

Optional adult energy estimates use Mifflin–St Jeor: `10 × kg + 6.25 × cm − 5 × age + (5 male / −161 female)`, multiplied by the selected activity factor. A muscle-gain selection adds an explicitly heuristic 200 kcal. Steps and exercise details are retained for context and not counted twice. This is not a clinical nutrition service; it does not support pediatric targets or medical diets.

## Architecture and data model

- `src/app`: App Router page, OAuth routes, protected state/recipe API routes, error/loading UI.
- `src/components`: responsive app shell, dashboard, six-step onboarding, grocery editor, recipe/cooking dialogs, planner, shopping, profile, and reusable UI controls.
- `src/lib/domain.ts`: deterministic unit conversion, inventory status, allergy/diet checks, recipe ranking, cumulative planning, nutrition arithmetic, shopping calculations.
- `src/lib/catalog.ts`: curated ingredient metadata and practical recipes.
- `src/lib/local-database.ts`: persistent embedded PostgreSQL, local accounts, and sessions. `backend.ts` selects local or Supabase storage.
- `src/lib/repository.ts`: authenticated Supabase database reads. `supabase/server.ts` and `proxy.ts`: cookie-based sessions and refresh.
- `supabase/migrations`: schema, ownership policies, account-profile trigger, atomic mutation functions.
- `tests`: domain tests and opt-in live Supabase integration tests. `e2e`: browser workflows.

`profiles` belongs to `auth.users`. `user_preferences` and optional `nutrition_goals` each belong to one profile. `ingredients` is a read-only shared catalog with stable text keys (an intentional exception to UUID primary keys). `inventory_items` records lots; `inventory_transactions` records changes. `recipes` stores complete recipe snapshots and `recipe_ingredients` provides normalized quantities. `meal_plans` has one record per user/date; entries reference a recipe and distinguish planned, prepared, and eaten states. `meal_logs` records eaten events. `shopping_items` contains editable purchases and suggestions.

Private tables have RLS; owner columns are validated against `auth.uid()`. Composite foreign keys prevent cross-user recipe/plan references. API routes verify sessions and same-origin writes, validate requests, and limit payload size. AI keys, USDA keys, and service-role credentials stay server-side. Local sign-in/signup attempts are database-rate-limited. Supabase's Auth rate limits apply when configured. General CRUD distributed rate limiting is not implemented.

Cooking locks the user's inventory transaction, validates total stock, consumes earliest-dated usable lots, creates history, and sets prepared in the same transaction. Failure rolls everything back. The persisted prepared flag makes repeated clicks/retries idempotent. Purchase-to-kitchen is atomic and removes the shopping row once; checked purchases alone do not add stock. Meal generation reserves quantities across the day. Manually added meals can exceed stock, but the app shows combined shortages and prevents cooking without sufficient stock.

## Tests

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

The default test run includes embedded PostgreSQL (PGlite): it applies the actual migration against a minimal local Auth schema and exercises ownership policies, rollback, idempotency, purchase transfer, rate limiting, and deletion cascades. This does not replace live Supabase/Auth integration testing.

Build the app before running Playwright; its web server uses the production build. Playwright uses installed Microsoft Edge (`channel: 'msedge'`) for desktop and mobile Chromium emulation. If Edge is unavailable, install Playwright Chromium and remove `channel` from the configuration. Browser tests use real email/password accounts in an isolated `.data/e2e` database with Supabase unconfigured. They cover onboarding, persistence, protected pages, cooking, shopping, sign-out, and deletion on desktop and mobile. They do not exercise Google OAuth. Development and production scripts use Next.js's supported Webpack mode because Turbopack's CSS worker connection failed on this Windows host.

Live integration tests skip unless all three `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, and `TEST_SUPABASE_SERVICE_ROLE_KEY` variables exist. Use a **dedicated disposable test project** with the migration applied. The suite creates two temporary accounts and removes them afterward. It verifies profile creation, ownership isolation, inventory CRUD, plan persistence, insufficient-stock rollback, concurrent duplicate cooking, and separate meal logs. Never point it at production.

See `docs/VERIFICATION.md` for the actual execution record and `docs/IMPLEMENTATION.md` for remaining work.

## Deploy to Vercel

1. Commit this folder to your repository and import it into Vercel as a Next.js project. Use Node 24, `npm run build`, and the default Next.js output settings.
2. Supabase is required on Vercel; the embedded local database cannot run there. Add the environment variables from `.env.example` in Vercel's project settings. Set the app URL to the production HTTPS origin. Re-deploy after changing public variables.
3. Apply the Supabase migration and configure the exact OAuth redirect URLs above.
4. Use a staging database to run the integration tests before inviting real users. Verify sign-in, callback session refresh, ownership isolation, and account deletion using two real test accounts.
5. Confirm USDA mappings and complete the missing Indian composition data before treating nutrition totals or targets as a finished product.

No live deployment or external account configuration is performed by this repository. It is prepared for your requested Vercel + Supabase stack; the server app is not exported as a static Sites page.

## Primary references

- [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [USDA FoodData Central API guide](https://fdc.nal.usda.gov/api-guide/)
- [Mifflin–St Jeor original publication](https://pubmed.ncbi.nlm.nih.gov/2305711/)
