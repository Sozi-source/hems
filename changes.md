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
