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
