# changes.md — append newest entry at the TOP. Update after every piece of work.

## 2026-10-08 — PWA icons & dev cache resolution (done, verified)
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
