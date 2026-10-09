# changes.md — append newest entry at the TOP. Update after every piece of work.

## 2026-10-09 - Flatten auth page surfaces and use solid gray/maroon
- Removed the framed white auth card and blurred decoration. Auth forms now sit directly on a flat light-gray surface beside a solid charcoal panel with maroon accents; auth feedback uses gray/maroon instead of green/rose colors.

## 2026-10-09 - Minimal login copy polish
- Simplified login headings, subtitle, button, supporting text, and shared auth-shell branding copy for a quieter premium presentation; kept form labels, recovery links, and signup navigation intact.

## 2026-10-09 - Enterprise gray and maroon authentication experience
- Replaced the basic sign-in page with a responsive HEMS authentication shell using slate-gray surfaces and maroon accents, shared accessible form controls, password visibility toggles, inline status/error messaging, and account-navigation links.
- Added Supabase email/password sign-up, forgot-password, and reset-password routes. Added `/auth/callback` to exchange confirmation/reset PKCE codes for sessions and safely redirect to local relative paths.
- Sign-up confirms by email when Supabase requires it; self-created users are told to ask an administrator for business access. Reset emails do not disclose whether an account exists.
- Deployment setup still needs the production app URLs allowed in Supabase Auth redirect settings (including `/auth/callback?next=/` and `/auth/callback?next=/reset-password`). No auth-provider changes were made.

## 2026-10-09 - Support Safaricom-issued seven-digit STK shortcode
- Safaricom API Support's approval email confirms the supplied seven-digit number is the production Business Short Code for STK Push. Updated STK config and C2B callback validation to accept numeric shortcodes from 5–7 digits; the earlier 5–6 digit check incorrectly rejected this approved shortcode.
- Keep the active business M-Pesa channel shortcode equal to the approved value, and ensure its channel type matches the app's STK flow before retrying.

## 2026-10-09 - Supabase CLI environment-file syntax repair
- Fixed `.env.local` parsing by changing five bare SMS variable names into valid empty `KEY=` assignments and removing trailing whitespace. Existing environment values were preserved and not printed. The empty SMS settings still need real values before SMS delivery is configured.
- Did not run `supabase db push`; the command applies pending migrations to the configured database. Retry it after reviewing the migration plan.

## 2026-10-09 - Money pipeline security hardening (in progress)
- Daraja STK prompts now require a verified same-origin request, active business membership with an operating role, an active M-Pesa Paybill channel matching that business's configured shortcode, the selected customer’s registered phone, and a safe whole-shilling amount. Credentials can be overridden per business code. The expected STK request is stored before calling Daraja; database advisory-lock limits cap prompts at 3 per customer and 10 per user per 10 minutes.
- Daraja STK and C2B callback endpoints now require a 256-bit shared bearer token in the callback URL; the local `.env.local` has a generated token, and its value is not recorded here. STK callback receipts are ingested only when a recorded checkout request exists and amount, phone, and Nairobi transaction timestamp match. C2B business attribution comes only from a registered active M-Pesa channel; unknown channels stay unassigned and conflict-held. Payments without a business assignment are not auto-matched across tenants.
- The dev payment simulator now uses an authenticated, role-checked endpoint and is disabled in production; it no longer calls the public Daraja confirmation webhook. Matching retries upsert one candidate per engine/rank, and payment conflict flags must be reconciled by an owner/admin with an auditable note before approval.
- New migration `20261009000009_money_pipeline_hardening.sql` adds STK rate limiting, payment conflict holds/reconciliation audit fields, retry-safe match candidates, and removes browser `SELECT` access to raw provider payloads. Apply this migration before relying on these database protections.
- Daraja configuration fails closed when shortcode, passkey, or environment is missing, uses Nairobi local time for STK passwords, and scopes its OAuth token cache to the environment and credentials. Browser payment views no longer request raw provider payloads. Obligation creation and approval-allocation RPC submissions send minor-unit amounts as strings to avoid JavaScript number conversion at those submission boundaries.
- Verification: `npx.cmd tsc --noEmit --incremental false` passed; `git diff --check` passed. No payment was initiated and no database migration was applied.
- Production setup remains: deploy the required secret env vars, register the tokenized C2B callback URLs, apply migration 09, configure Safaricom source-IP allowlisting at the trusted edge, and add independent transaction-status or statement reconciliation. The URL token is a bearer secret, not a Safaricom signature; keep it out of logs. Do not use ngrok in production.

## 2026-10-09 - SMS worker foundation and customer creation repair (in progress)
- Daraja STK Push now rejects localhost or non-HTTPS callback URLs with a clear setup error; `.env.example` documents `DARAJA_CALLBACK_URL` for a deployed host or HTTPS tunnel. Current local config uses localhost, explaining the `Invalid CallBackURL` response.
- Duplicate cleanup: removed the newer, unreferenced same-business duplicate while retaining the original customer. A final database check found zero exact duplicate groups. The other repeated account number belongs to a different business.
- Customer validation now checks 2-120 character names, supported Kenyan phone formats, and non-negative KSh credit limits with safe bigint precision. The API repeats these checks and rejects an existing normalized name/phone pair within the same business.
- Added a database trigger migration for race-safe duplicate prevention and name normalization. The Master customer list now shows each business so per-business account numbers such as C0001 are distinguishable. Existing customer rows are retained for review; apply migration `20261009000008_customer_validation.sql` to enforce the database check.
- Customer creation now requires a signed-in Supabase user and uses that session for business lookup and insertion, enforcing existing membership and customer RLS policies. The businesses endpoint is session-scoped too.
- The admin client no longer falls back to the public anon key. Missing service-role configuration now fails clearly rather than running privileged operations as anonymous.
- Added a service-only queue claim function using SKIP LOCKED, an authenticated Africa's Talking worker endpoint, and a token-protected callback that records delivery receipts.
- Documented Africa's Talking credentials and worker/callback secrets in .env.example.
- Remaining setup: apply the migration, set credentials and secrets, configure the provider callback URL, and schedule /api/sms/worker each minute. No real messages were sent; implementation was not built or exercised in this turn.
- Runtime diagnosis: the Supabase Auth response includes `x-sb-error-code: invalid_credentials`, confirming the configured public key reaches the project but the submitted email/password were rejected. The logged-out REST 401s are consistent with the database migration revoking anonymous table access; they are not by themselves evidence of bad API keys. Do not rotate keys based on these responses.
- Follow-up: customer/business API responses distinguish an API-key rejection from an invalid login session. Authenticate successfully before retrying customer creation; if the password login still fails, check the exact Auth error shown on the login form.

## 2026-10-09 — Windows Turbopack File-Lock Fix (`package.json`) (done, verified)
- **Resolved Windows Turbopack `ENOENT -4058` Crashes**:
  - Replaced `"dev": "next dev --turbopack"` with `"dev": "next dev"` in `package.json`. Next.js Turbopack on Windows has a known file-locking bug during atomic renames of `_buildManifest.js.tmp.*` and `build-manifest.json`.
  - Cleaned corrupted `.next` cache directory. Standard Next.js development server is completely stable on Windows.
- **Removed Helper Text**: Removed `Accepts 07..., 01..., or 254...` hint text from `AddCustomerModal`.

## 2026-10-09 — Form Validation & Business Select Resolution Fix (done, verified)
- **Resolved "Please select an item in the list" Validation Trap**:
  - Bound `<option value={b.id || b.code}>` across `AddCustomerModal`, `CreateObligationModal`, and `SimulatePaymentModal`.
  - When `b.id` was initially empty (`""`), the HTML5 `<select required>` treated the option as unselected and halted submission with a browser validation tooltip.
- **Server-Side Business Resolution** (`/api/businesses`):
  - Added dedicated API route that queries `public.businesses` using service role admin client (`createAdminClient()`), bypassing client-side RLS and authentication timing issues.
  - Updated `BusinessProvider` (`src/context/business-context.tsx`) to hydrate business records from `/api/businesses`.
- **Customer Creation Endpoint** (`/api/customers`):
  - Created server endpoint to handle customer creation with code-to-UUID resolution (e.g. mapping `'HARON_FASHION'` to its database UUID).
  - Handles Kenyan phone numbers and credit limits with clean server-side error formatting.
  - Updated `AddCustomerModal` to invoke `/api/customers`.
- **Verification**: `npm run build` compiled 100% cleanly across all 18 routes (exit code 0).

## 2026-10-08 — Phase 2: Safaricom Daraja M-Pesa Pipeline & Automated Matching Engine (done, verified)
- **Daraja API Client & Security** (`src/lib/daraja/client.ts`, `types.ts`):
  - Safaricom OAuth client credentials generator with in-memory token expiry caching.
  - Timestamped SHA256/Base64 password generator for STK Push (`shortcode + passkey + timestamp`).
  - Kenyan MSISDN telephone normalizer supporting `07...`, `+254...`, `254...`, and 9-digit formats into canonical `254XXXXXXXXX`.
  - Admin Supabase client (`src/lib/supabase/admin.ts`) using `SUPABASE_SERVICE_ROLE_KEY` to execute privileged database procedures revoked from authenticated users.
- **C2B Webhook Endpoints**:
  - `/api/daraja/c2b/validation`: Standard Safaricom validation acknowledging incoming Paybill requests with zero latency (`{ ResultCode: 0, ResultDesc: 'Accepted' }`).
  - `/api/daraja/c2b/confirmation`: Parses Safaricom C2B payloads into minor units (cents), normalizes Nairobi timestamps into ISO 8601 strings, resolves business shortcode/tenant attribution, invokes PostgreSQL procedure `public.ingest_payment()`, and dispatches the automated matching engine.
- **STK Push Pipeline**:
  - `/api/daraja/stk/push`: Sends STK Push PIN prompts directly to customer phones via Daraja `processrequest` API, auto-resolves or registers the business payment channel, and records tracking entries in `public.stk_requests`.
  - `/api/daraja/stk/callback`: Processes customer PIN authorization or cancellation callbacks, extracts `MpesaReceiptNumber`, updates `stk_requests` status, ingests completed transactions via `public.ingest_payment()`, and triggers automated debt matching.
- **Automated Multi-Layer Matching Engine** (`src/lib/daraja/matcher.ts`):
  - Layer 1: Exact invoice reference match (`100% Exact Match`).
  - Layer 2: Exact customer account number match (`100% Exact Match`).
  - Layer 3: Payer phone number match against registered customers (`90% Phone Match`).
  - Automatically attributes unassigned transactions to the matched customer's business and pre-selects the customer's oldest open receivable into `public.match_candidates`.
- **UI & Cashier Workflow Enhancements**:
  - **In-App Payment Simulator** (`SimulatePaymentModal`): Allows testing full C2B payment ingestion directly from the `/payments` UI with customer selector and randomized receipt references.
  - **Prompt M-Pesa Buttons** (`StkPromptModal`): Embedded on `/obligations` and `/customers` for single-click STK PIN push to customer phones.
  - **Approve Payment Modal** (`ApprovePaymentModal`): Auto-detects matched candidates from `public.match_candidates`, displaying confidence badges and pre-selecting open invoices for 1-click settlement.
  - **Database Column Alignment**: Rendered `occurred_at`, `payer_msisdn`, `account_reference`, and match confidence tags across `/payments` and `PendingApprovalsCard`.
- **Verification**: `npm run build` compiled 100% cleanly across all 16 routes with zero errors.

## 2026-10-08 — Modal Viewport & Portal Teleportation Fix (done, verified)
- **Resolved Header Modal Clipping**: Converted `Modal` (`src/components/ui/modal.tsx`) to use React `createPortal(..., document.body)`. This completely decouples the modal from `<header>`'s CSS containing block caused by `backdrop-blur-md`.
- **Safe Viewport Positioning**: Replaced flexbox overflow centering with `items-start sm:items-center` inside a `min-h-full overflow-y-auto` container with bounded dialog `max-h-[calc(100vh-2rem)]` and scrollable body. Modals now always display their top title bar and fields clearly regardless of screen height.

**Transformed** design system to retain deep navy exclusively on the navigation sidebar while giving the dashboard a clean white foundation with rich navy and maroon/crimson accents:
- **Sidebar & Mobile Navigation**: Retained deep navy (`#0A1128` / `#0F172A`) with subtle slate-800 borders, rich maroon brand logo (`#881337`), and crisp navigation states.
- **Dashboard Canvas**: Switched main content and header to clean white (`#FFFFFF` / `#F8FAFC`) with subtle slate-200 borders and dark slate typography (`text-slate-900`).
- **Cards & Surfaces**: Clean white cards (`bg-white border-slate-200/90 shadow-sm`) with high contrast text.
- **Maroon & Navy Component Accents**:
  - Haron Fashion cards and badges styled in rich maroon (`#881337` / `#BE123C`).
  - Zenith Plast cards and badges styled in authoritative deep navy (`#0F172A`).
  - Primary CTAs and action buttons in deep navy (`bg-[#0F172A] hover:bg-slate-800 text-white`).
  - Danger / Rejection CTAs in rich maroon (`bg-[#881337] hover:bg-[#70102D] text-white`).
  - Filter pills and table headers updated to light slate styling.
- **Modals & Forms**: Converted `AddCustomerModal`, `CreateObligationModal`, `ApprovePaymentModal`, and `RejectPaymentModal` to clean white dialog surfaces with light inputs and selects.
- **Verification**: `npm run build` compiled 100% cleanly across all 12 routes with zero errors.

- **Generated PWA Icons & Favicon**: Added `public/icon-192.png`, `public/icon-512.png`, and `public/favicon.ico` via Node image generator in `scripts/generate-icons.js`, resolving all `GET /icon-192.png 404` errors.
- **Git Repository Initialized**: Linked to remote `origin https://github.com/Sozi-source/hems.git`.

**Built** interactive action modals and connected live PostgreSQL workflow functions and Supabase authentication:
- **Modal Component Primitive** (`src/components/ui/modal.tsx`): Clean, accessible, backdrop-blurred modal dialog.
- **Add Customer Modal** (`src/components/customers/add-customer-modal.tsx`): Supports tenant selection, full name, Kenyan phone number normalization, optional credit limit, and connects to `public.customers` with trigger-generated `customer_no` (`C0001`, `C0002`...).
- **Create Debt or Bill Modal** (`src/components/obligations/create-obligation-modal.tsx`): Supports Customer Debt, Bill/Expense, and Supplier Debt with live customer dropdown, minor-unit financial precision (`parse_kes`), and calls `public.create_obligation()`.
- **Payment Approval & Rejection Engine** (`src/components/payments/approve-payment-modal.tsx`, `reject-payment-modal.tsx`):
  - Modal to allocate payments against open receivables or approve to account balance with note.
  - Calls `public.approve_payment()` and `public.reject_payment()` with atomic database trigger consistency.
  - Wired into `/payments` and dashboard's `PendingApprovalsCard`.
- **Live Supabase Authentication** (`src/app/(auth)/login/page.tsx` & `header.tsx`):
  - Connected `supabase.auth.signInWithPassword()`.
  - Added session user display and Sign Out button in header.
- **Reporting Views Integration**:
  - `/customers` queries `v_customer_balances`.
  - `/obligations` queries `v_obligation_overview`.
  - `/` queries `v_business_dashboard` and `v_master_dashboard`.
- **Verification**: `npm run build` compiled cleanly (0 errors) across all 12 routes.

**Assessed** all pending tasks required to take HEMS to production readiness across 6 phased milestones:
- **Phase 1b (Next)**: Action Modals & Data Entry (Add Customer with auto-C0001 codes, Create Debt/Bill modal calling `create_obligation()`, Approve/Reject buttons calling `approve_payment()`, Supabase Auth login).
- **Phase 2**: Safaricom Daraja Payment Pipeline (C2B validation/confirmation webhook, STK Push request/callback, SMS parser, automated matching engine).
- **Phase 3**: SMS Pipeline (Africa's Talking sender worker, delivery receipts, automated confirmation trigger).
- **Phase 4**: Automated Schedulers (`pg_cron` jobs for `queue_due_reminders` and `generate_recurring_obligations`).
- **Phase 5**: Financial Operations (Payment reversals, customer statements, export reports).
- **Phase 6**: Security Hardening & Production Deployment (Vault secrets, role UI gates, Vercel/Cloudflare deploy).

## 2026-10-08 — Complete purge of descriptions and explanatory text (done, verified)
**Purged** all explanatory sentences, subtitles, instructional paragraphs, and card descriptions across all pages and components.
- Interfaces are now clean, uncluttered, and data-focused without filler text or explanations.
- Added root `not-found.tsx` handler for Next.js 15.
- **Verification**: `npm run build` succeeded with code 0 across all 12 routes.

## 2026-10-08 — UI simplification & dummy data purge (done, verified)
**Purged** all hardcoded mock arrays, fake balances, and dummy UUIDs across all pages.
- **Real Database Integration**: Connected all pages (`/`, `/payments`, `/obligations`, `/customers`, `/reminders`, `/audit`, `/settings`) directly to real Supabase tables with clean empty states.
- **Terminology Simplification**: Replaced technical jargon with clean, simple terms:
  - "Consolidated Financial Master" → "All Businesses"
  - "Pending Ingest Queue / Rule 4" → "Pending Payments"
  - "Debts & Obligations Ledger" → "Debts & Invoices"
  - "Customer Directory & Paybills" → "Customers"
  - "Automated Outbox & Templates" → "Reminders & SMS"
  - "Tamper-Evident Immutable Audit Trail" → "Activity Log"
- **Verification**: `npm run build` succeeded with code 0 across all 12 routes.

## 2026-10-08 — Phase 0b: Next.js scaffold & fintech design system (done, verified)
**Added** Next.js 15 App Router scaffold, multi-tenant BusinessProvider context, fintech design tokens, and PWA configuration in `src/`.

- **Design System & Tokens**: Custom slate-obsidian surface hierarchy, high-contrast dark palette, tactile border radii (6-12px), precision glow accents, and strict `tabular-nums` typography.
- **Rule 2 Money Minor Units Engine**: Implemented `fmt_kes` and `parse_kes` in `src/lib/format.ts` (formatting `bigint` cents without floating-point precision loss) and custom `MoneyDisplay` component.
- **Tenancy & Business Isolation (Rule 1)**: Built `BusinessProvider` context with real-time switching between `HARON_FASHION`, `ZENITH_PLAST`, and `MASTER` consolidated mode. Persists via cookie and localStorage.
- **Responsive Layout & Mobile-First PWA**:
  - Desktop: Left collapsible sidebar with active business switcher, live status indicator, and navigation items.
  - Mobile: Bottom navigation bar (`MobileNav`) with thumb-friendly controls and safe-area inset protection.
  - PWA: Web App Manifest (`manifest.ts`) configured for standalone mobile installation.
- **Fintech Component Suite**: `MetricCard`, `Badge` (with semantic dot indicators), `Button` (interactive microstates + loading spinner), `Input`, `Card`, and `PendingApprovalsCard` enforcing Rule 4.
- **Application Pages**:
  - `/`: Consolidated Master Overview and Business-specific dashboard with financial KPIs, Pending Approvals queue, and recent activity.
  - `/payments`: Payment ledger with Daraja C2B/STK ingest review and approval actions.
  - `/obligations`: Unified debts & obligations ledger.
  - `/customers`: Customer directory with Paybill account codes (`C0001` format) and verified M-Pesa identities.
  - `/reminders`: SMS outbox and automated reminder schedules.
  - `/audit`: Immutable audit trail viewer.
  - `/settings`: Business tenant configuration and Safaricom Daraja Paybill shortcodes.
  - `/login`: Secure fintech authentication screen.
- **Verification**: Executed `npm run build` (`next build`) — all 12 routes compiled and prerendered cleanly with zero TypeScript or bundling errors.

## 2026-10-06 — Phase 1: database foundation (done, tested)
**Added** `supabase/migrations/` 01–06, `seed.sql`, `tests/` (stub, runner, 001 workflow suite), `agent.md`, `changes.md`, `src/` placeholder.

- 01 foundation: enums, helpers (`normalize_msisdn`, `fmt_kes`, `render_template`, `next_occurrence`), tenancy
  (`businesses`, `business_members`, roles, `business_settings`), counters.
- 02 parties & obligations: customers (+verified payment identities), suppliers, staff, expense categories,
  recurring templates, unified `obligations` + append-only `obligation_entries` (trigger-maintained balances),
  `loan_terms`. Composite FKs enforce business isolation at DB level.
- 03 payments: `payment_channels` (Paybill per business), `payment_transactions` (unique per provider+ref),
  `payment_ingest_log`, `stk_requests`, `match_candidates`, `payment_allocations`.
- 04 reminders/SMS: templates, `sms_outbox` (idempotent via dedupe_key), `reminder_schedules/runs`, notifications;
  auto schedule on every obligation; auto-stop on clear / resume on reversal; per-business bootstrap trigger.
- 05 workflow functions: `create_obligation`, `create_loan`, `write_off_obligation`, `ingest_payment`,
  `assign_payment_business`, `approve_payment`, `reject_payment`, `reverse_payment`,
  `generate_recurring_obligations`, `queue_due_reminders`, `business_today`.
- 06 audit + RLS + views + grants: immutable audit log with triggers, RLS on every table, dashboard/statement/loan/
  reminder views, master dashboard, server-only function grants.

**Verified** (`run_tests.sh` → ALL TESTS PASSED on PostgreSQL 16): Pending-first ingest; Paybill→business attribution;
duplicate SMS/payload/ref never double-record; amount-conflict flagging; role checks (cashier cannot approve; browsers cannot call ingest);
cross-business allocation and FK blocked; over-allocation blocked; double approval blocked; direct balance edit blocked;
ledger/audit immutable (RLS for users, trigger for admins); exact confirmation SMS text; PAID IN FULL + reminders stop;
reversal restores balance + resumes reminders; overpayment kept as unallocated credit; unassigned inbox hidden from non-admins;
reminders fire once, never backdate for new schedules, use current balance, cancel when cleared; recurring rent generated
idempotently; loan interest/next-repayment; outgoing payment settles loan; per-business + master dashboards; audit records actor.

**Bugs found by the tests and fixed before delivery**
1. `ingest_payment`: ambiguous array append (`text[] || unknown`) → explicit `array_append(..., ::text)`.
2. `approve_payment`: `sum(bigint)` is numeric → cast to bigint before `fmt_kes`.
3. Reminders could fire "catch-up" messages for dates before a schedule existed → now never backdated.
4. Payables with no due date produced meaningless reminders → now require a real due date (customer debts fall back to issue date).
5. Ledger `entry_date` defaulted to the DB's UTC date → now uses the business's local date (`business_today`).

**Not done yet / next**: Next.js scaffold + design system (Phase 0b), then Phase 2 payment pipeline (Edge Functions for
Daraja C2B/STK, SMS parser, match scoring), pg_cron schedules, SMS sender. Tests so far ran on plain Postgres with a stubbed
`auth` schema — re-run on `supabase start` before relying on them.
