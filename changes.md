# Pay Debt (Paper Money / Cash Payment) & Counter Debt Settlement

- **added** `supabase/migrations/20261025000017_record_cash_payment.sql` — Added migration defining `record_cash_payment` SQL function, configured cash channels (`CASH-<code>`) across businesses, and updated `on_business_created` to auto-provision cash channels for future business entities. Supports FIFO debt allocation, custom paper receipt references, and instant payment confirmation SMS.
- **added** `src/app/api/payments/cash/route.ts` — Created authenticated endpoint for processing paper money / cash payments. Validates user permissions (`owner`, `admin`, `accountant`, `cashier`), posts approved cash transactions, reduces customer debt obligations, and triggers immediate SMS confirmation delivery.
- **added** `src/components/payments/pay-debt-modal.tsx` — Reusable fintech modal for recording paper money cash payments with live remaining debt calculation, quick full/partial settlement chips, paper receipt book reference inputs, cashier notes, and instant customer SMS notification toggles.
- **changed** `src/app/(dashboard)/customers/page.tsx` — Added emerald `Pay Debt` action button to desktop customer table and mobile cards to allow immediate counter debt settlement.
- **changed** `src/components/customers/customer-history-modal.tsx` — Added `Pay Debt` button directly in the customer historical ledger/statement modal header with immediate ledger refresh on completion.
- **changed** `src/app/(dashboard)/obligations/page.tsx` — Added `Pay Cash` button on receivable customer debts across desktop table and mobile cards.
- **changed** `src/components/obligations/obligation-history-modal.tsx` — Added `Pay Debt` button in obligation modal header to settle specific invoices directly with cash.
- **changed** `src/app/(dashboard)/payments/page.tsx` — Added `Pay Debt (Cash)` button to page header action bar.
- **changed** `supabase/tests/001_core_workflow.sql` — Added test assertion verifying cashier can record cash payments, update balances, queue confirmation SMS, and audit transactions.
- **added** `scripts/test-cash-payment.js` — Standalone test utility verifying end-to-end cash payment ingest, allocation, balance reduction, and confirmation SMS delivery.

## Verification
- Ran `scripts/test-cash-payment.js`: Successfully verified cash payment ingestion, balance reduction from KES 500 to KES 200, status update to `partially_paid`, and confirmation SMS queueing.
- Ran `npm run build`: Production build and type checking passed with 0 errors across all 36/36 routes.

# Bank Payment Channels, Single-SMS Optimization & Remittance Statements

- **added** `supabase/migrations/20261025000016_bank_payment_channels_and_templates.sql` — Configured active bank Paybill channels: Equity Bank (`247247`, Acc `650166`) and NCBA Bank (`880100`, Acc `650166`) for Haron Fashion; Absa Bank (`303030`, Acc `1398#`) for Zenith Plast. Optimized SMS templates (`credit_sale_invoice` and `customer_reminder`) to fit strictly within single-SMS character limits (<= 160 characters) to cut provider SMS credit consumption by 50%.
- **changed** `src/components/customers/customer-history-modal.tsx` — Made customer statement generation dynamic by business; statements and WhatsApp remittance prompts now output the exact bank accounts and paybills (Equity 247247 / NCBA 880100 for Haron Fashion vs Absa 303030 for Zenith Plast).
- **added** `scripts/sync-channels.js` — Synchronization utility to upsert and verify live payment channels in Supabase.

## Verification
- Applied updates to database via live Supabase client and verified all templates are <= 160 chars and payment channels are active.
- Run `npm run build`: Production build and type checking passed with 0 errors across all 35/35 routes.

# Instant Credit Sale SMS & Returning Customer Fast Add Debt

- **added** `supabase/migrations/20261025000015_instant_debt_sms.sql` — Added `credit_sale` to `sms_outbox` kind constraint, added `credit_sale_invoice` default template, updated `on_business_created` and `create_obligation()` to automatically queue an instant SMS when goods are picked on credit (`customer_debt`).
- **changed** `src/components/obligations/create-obligation-modal.tsx` — Added support for `preselectedCustomer`, instant customer search filter for large customer bases, and automatic background trigger to `/api/sms/dispatch`.
- **changed** `src/app/(dashboard)/customers/page.tsx` — Added instant `+ Add Debt` button to both mobile cards and desktop table rows so returning customers can be billed immediately without re-creating their profile.
- **changed** `src/components/customers/customer-history-modal.tsx` — Added `+ Add Debt` button in the header of customer historical statement/ledger modal to allow billing returning clients directly while viewing their history.
- **added** `src/lib/sms/processor.ts` & `src/app/api/sms/dispatch/route.ts` — Extracted SMS queue processing into reusable module and created an authenticated dispatch endpoint for sub-second SMS delivery upon user action.

## Verification
- Run `npm run build`: Production build and type checking passed successfully with 35/35 pages static/dynamic rendering.

# Mobiwave SMS Live API Activation & Test Suite

- **changed** `src/app/api/sms/worker/route.ts` — Added fallback default endpoint `https://sms.mobiwave.co.ke/api/v3/sms/send` if `MOBIWAVES_API_URL` is omitted, and added `queue_uid` extraction into `provider_message_id`.
- **changed** `src/app/api/sms/delivery/route.ts` — Added `queue_uid` and `uid` parsing for delivery report callbacks.
- **added** `scripts/test-sms.js` — Standalone test utility to dispatch test SMS directly via Mobiwave API and verify credentials/response payloads.
- **changed** `.env.local` — Added `MOBIWAVES_API_URL`, `MOBIWAVES_API_KEY`, and `MOBIWAVES_SENDER_ID` configuration slots.

## Verification
- Live API verified via `scripts/test-sms.js` with trial Sender ID `MOBIWAVE`: received HTTP 202 with `queue_uid: 10fe39c9-fc7a-40ca-9dfe-7a7e5d70eb19`, queried queue status confirming `status: completed` and 1 recipient processed.
- Run `npm run build`: Production build and type checking passed successfully with 34/34 pages static/dynamic rendering.

# HEMS SMS provider switch — Mobiwaves

- **changed** `src/app/api/sms/worker/route.ts`, `src/app/api/sms/delivery/route.ts`, `.env.example`, `agent.md`, and `supabase/migrations/20261022000014_sms_provider_mobiwaves.sql` — Removed Africa's Talking from active configuration and outbound delivery, configured Mobiwaves endpoint/key/sender settings, and tagged new queue claims and delivery callbacks as Mobiwaves.
- The user supplied Mobiwave SMS API docs confirming `/api/v3/sms/send`, Bearer token authentication, JSON fields `recipient`, `sender_id`, `type: plain`, and `message`, plus `status: success|error` responses. The worker now uses this contract. An approved sender ID is required; the dashboard screenshot showed none active.

## Verification
- Source search confirms no Africa's Talking configuration remains outside historical migration files that preserve applied schema history.
- Tests/build were not run.

# HEMS UI redesign — Batch 4: payments

- **changed** `src/app/(dashboard)/payments/page.tsx` — Updated payment filters, table surfaces and row spacing; enforced one-line tabular presentation for transaction references, dates, phone numbers, account references, statuses and KSh amounts. Existing payment queries, filters, approval/rejection actions and simulation modal remain unchanged.

## Verification
The uploaded archive does not include `package.json`, `tsconfig.json`, the lockfile or Tailwind configuration. Type check and production build could not be run. No payment processing logic or data access was intentionally changed.

## Screen checks
- **Phone (320/360/430px):** swipe inside the payment table; verify payer phone, transaction reference, date, account reference and KSh amount stay on one line. Test filter tabs and payment review actions.
- **Desktop (1280/1920px):** verify filter states, table alignment, status badges and approval/rejection controls.
