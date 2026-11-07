# Flexible Adjusted Due Dates, Merged Customer SMS Reminders, Daily Overdue Reminders (8:00 AM), Employee Rights & Audit Trail

- **added** `src/app/api/obligations/due-date/route.ts` — Created authenticated endpoint (`PATCH`) allowing owners, admins, accountants, and cashiers to adjust debt due dates. Supports updating an individual obligation or batch synchronizing all active open debts for a client to a single common due date. Fully audited via `audit_log`.
- **changed** `src/components/obligations/create-obligation-modal.tsx` — Added comprehensive flexible due date controls when issuing goods on credit / recording debt:
  - **Client Debt & Timeline Inspection**: Automatically queries the client's active open debts, displaying total balance, open bill count, and current due date status (e.g. overdue or days remaining).
  - **Quick Adjustment Presets**: One-click pills for `Keep Existing Due Date`, `+7 Days`, `+14 Days` (default), `+21 Days`, `+30 Days`, and `End of Month`.
  - **Dynamic Relative Days Feedback**: Shows real-time countdown or overdue indicators (`Due in X days`, `Due today`, `Backdated / overdue`).
  - **Common Due Date Synchronization**: Interactive toggle to synchronize all existing open debts for the customer to the adjusted due date, creating a unified payment deadline across the customer's entire balance.
- **changed** `src/components/obligations/obligation-history-modal.tsx` — Added inline "Adjust Due Date" action on active debts with quick presets (`+7d`, `+14d`, `+21d`, `+30d`, `End of Month`), custom date picker, and instant save, allowing owners to extend or adjust deadlines directly from the ledger.
- **changed** `src/lib/sms/reminder-engine.ts` — Implemented customer-level debt merging for SMS reminders:
  - Groups active open debt obligations by customer (`(business_id, customer_id)`).
  - Merges multi-debt balances into one aggregate outstanding balance (`fmt_kes(totalBalanceMinor, { showCents: false })`).
  - Implements a common due date:
    - **Overdue Priority**: If any debt is overdue, selects the earliest unpaid due date (oldest overdue debt in FIFO accounting) as the common due date anchor, calculating `days_overdue = today - min(due_date)`.
    - **Advance Notice**: If no debts are overdue, selects the nearest upcoming due date as the common due date anchor, calculating `days_remaining = min(due_date) - today` (notifying when $\le 3$ days remaining).
  - Enforces daily deduplication key `reminder:merged:${biz.id}:${cust.id}:${todayStr}:${mode}`, guaranteeing **exactly 1 SMS per customer per calendar day**.
  - Schedules delivery at **8:00 AM** local business time (`Africa/Nairobi`).
  - Strictly guarantees single-SMS length ($\le 160$ characters, safely under the 163-character threshold to avoid double SMS carrier charges).
- **changed** `supabase/migrations/20261107000020_daily_overdue_reminders_and_audit.sql` — Updated PostgreSQL function `queue_due_reminders()` to mirror the customer-level debt aggregation, common due date calculation, 8:00 AM scheduling, and daily deduplication key.
- **changed** `business_settings.reminder_send_hour` — Configured owner's preferred daily reminder dispatch hour to **8:00 AM** (`reminder_send_hour = 8`) across all businesses (`HARON_FASHION`, `ZENITH_PLAST`, and dev tenants).
- **added** `src/app/api/team/route.ts` — Created authenticated endpoint for owner employee rights allocation (`GET`, `POST`, `PATCH`, `DELETE`). Enables owners to add/invite staff members, assign roles (`cashier`, `accountant`, `admin`, `viewer`), suspend/activate access, and safely guard against sole owner lockout.
- **added** `src/app/(dashboard)/team/page.tsx` — Built comprehensive Team & Rights Management screen with KPI metrics, role description breakdowns (Cashier frontline counter rights for adding customers & debts vs Accountant payment approvals), employee management table, and zero-placeholder rights allocation modal.
- **added** `src/app/api/audit/route.ts` — Created authenticated audit trail endpoint (`GET`) with strict owner/admin security, multi-entity filtering (Customers, Debts, Payments, Team, Settings), actor breakdown, search, and human-readable activity descriptions.
- **added** `src/app/(dashboard)/audit/page.tsx` — Built Activity Audit Trail viewer with summary metrics, filter toolbar (by Employee, Entity, and Action), real-time activity log feed, and structured old vs new data inspect diff modal.
- **changed** `src/context/business-context.tsx` — Enriched context to dynamically detect and expose the logged-in user's role (`currentRole`, `isOwner`, `isAdmin`, `isCashier`).
- **changed** `src/components/layout/sidebar.tsx` & `src/components/layout/mobile-nav.tsx` — Added "Team & Rights" (`/team`) and "Audit Trail" (`/audit`) navigation links, and updated user profile strip to display the user's actual role in the active business.
- **changed** `src/app/(dashboard)/reminders/page.tsx` — Added "Check & Dispatch Reminders" trigger button, status counters (Sent, Queued, Failed), and live character count indicators confirming single-SMS compliance.
- **changed** `src/app/(dashboard)/settings/page.tsx` — Added "Team Rights & Employee Activity" quick-access card linking directly to Team management and the Activity Audit Trail.
- **changed** Forms & Inputs — Removed remaining `placeholder="..."` attributes in `login/page.tsx`, `customer-history-modal.tsx`, and `edit-customer-modal.tsx` to maintain 100% zero-placeholder compliance across the codebase.
- **added** `scripts/preview-merged-reminders.js`, `scripts/sync-overdue-templates.js` & `scripts/verify-new-features.js` — Synchronization, preview, and verification utilities for merged customer reminders, single-SMS character length constraints, and audit trail functionality.

## Verification
- Ran `npm run build`: Production build and type checking passed with 0 errors across all 39/39 routes (including `/api/obligations/due-date`).
- Verified zero placeholder attributes across `src/` using recursive pattern scan.
- Ran `node scripts/preview-merged-reminders.js`: Verified customer debt merging across 61 active debts and 43 customers with common due date anchor. Max length across all messages: **138 chars** ($\le 160$ chars single-SMS limit).
- Ran `node scripts/test-template-lengths.js`: Verified all customer SMS templates are $\le 160$ chars (max 158 chars across all stress tests).
- Ran `node scripts/verify-new-features.js`: Successfully verified live SMS templates, outbox message lengths, member roles, and active audit log table in Supabase.

# Suppliers Directory, Zero-Placeholder Form Purge & Phonebook Integration

- **added** `src/app/api/suppliers/route.ts` — Created authenticated API endpoint for managing supplier records (`GET`, `POST`, `PATCH`), supporting business isolation, multi-tenant master view, and supplier contact queries.
- **added** `src/app/(dashboard)/suppliers/page.tsx` — Built comprehensive Suppliers Directory with KPI summary cards (Outstanding Supplier Payables, Total Registered, Payment Terms Standard), real-time search, one-click WhatsApp/Call triggers, and status badges.
- **added** `src/components/suppliers/add-supplier-modal.tsx` — Created Add Supplier modal featuring Phonebook Integration (Web Contacts Picker API + Quick Paste) for instant vendor contact population with clean, zero-placeholder form styling.
- **changed** `src/components/layout/sidebar.tsx` & `src/components/layout/mobile-nav.tsx` — Added "Suppliers" navigation link with vendor truck icon across desktop sidebar and mobile navigation bar.
- **changed** `src/components/obligations/create-obligation-modal.tsx` — Integrated dynamic supplier selector when recording supplier debts (`supplier_debt`), automatically populating payment terms and associating the bill with the chosen vendor.
- **changed** Forms & Inputs Across Codebase — Completely purged all `placeholder="..."` attributes across all forms, dialogs, auth inputs (`login`, `signup`, `forgot-password`, `reset-password`), payment modals (`pay-debt-modal`, `approve-payment-modal`, `reject-payment-modal`, `simulate-payment-modal`, `stk-prompt-modal`, `paste-alert-modal`), phonebook modal, and search toolbars to eliminate text congestion and visual clutter. Verified zero placeholder occurrences remain across the entire codebase.

## Verification
- Ran `npm run build`: Production build and type checking passed with 0 errors across all 38/38 routes.
- Verified 0 remaining placeholder attributes across `src/` using recursive pattern scan.
- Ran `node scripts/test-template-lengths.js`: Verified all customer SMS templates are $\le 160$ chars (max 158 chars), strictly guaranteeing 1 SMS credit billing.

# Phonebook Contact Ingest & Appended Business Phone Numbers in Messages

- **added** `supabase/migrations/20261029000018_append_business_phone_numbers_to_sms.sql` — Upserted all customer SMS templates (`credit_sale_invoice`, `customer_reminder`, `payment_confirmation`, `payment_confirmation_paid_in_full`) across Haron Fashion (`HARON_FASHION`, `DEV_HARON_FASHION`) to append `Haron fashio-0725499796`, and across Zenith Plast (`ZENITH_PLAST`, `DEV_ZENITH_PLAST`) to append `Zenith- 0711377496`. Updated `create_obligation()` fallback template to automatically append the designated contact number.
- **added** `scripts/sync-sms-templates.js` — Synchronization utility applying the updated SMS templates and appended contact numbers directly to the live Supabase database.
- **changed** `src/lib/customers/phonebook-parser.ts` — Added `parseSingleContactString()` with robust Kenyan phone number detection (matching spaced formats like `+254 722 000 111`, `0712-345-678`, etc.), name extraction, and alias/nickname extraction from quotes and parentheses.
- **changed** `src/components/customers/add-customer-modal.tsx` — Integrated phonebook picker via Web Contact Picker API (`navigator.contacts.select`) for mobile devices and PWA. Added quick-paste and auto-fill helper for pasted contact strings (e.g. `Mama Brian - 0712345678`), visual confirmation tags upon load, and direct link to batch import.
- **changed** `src/components/customers/import-phonebook-modal.tsx` — Added native `Device Phonebook` tab enabling multi-contact picking directly from phone contacts into the import table, alongside existing file upload (.vcf/.csv) and paste options.
- **changed** `src/components/customers/customer-history-modal.tsx` — Updated WhatsApp statement and remittance sharing to append `Haron fashio-0725499796` for Haron Fashion and `Zenith- 0711377496` for Zenith Plast.
- **changed** `src/app/(dashboard)/settings/page.tsx` — Added interactive "Customer SMS Templates & Sign-Off Numbers" card displaying active templates, appended contact numbers, live character counts (≤160 chars single-SMS indicators), and inline template editor.
- **changed** `src/app/(dashboard)/customers/page.tsx` — Updated header action bar to feature "Import Phonebook" with icon and wired seamless navigation from Add Customer to Import.
- **changed** `supabase/tests/001_core_workflow.sql` — Updated payment confirmation SMS test assertion to expect the appended `Haron fashio-0725499796` tag.
- **added** `scripts/verify-features.js` — Automated verification script testing contact string parsing, phone normalization, and live database SMS templates.

## Verification
- Ran `node scripts/test-template-lengths.js`: Stress tested every customer SMS template across multiple edge-case scenarios (long names like `Bartholomew`, debts over `KSh 1,500,000`, balances over `KSh 5,000,000`). Confirmed maximum rendered character count is at most 158 chars ($\le 160$ chars), strictly guaranteeing 1 SMS credit billing and never deducting 2 SMS credits.
- Ran `node scripts/verify-features.js`: Successfully verified contact parser edge cases and verified that all 16 template records in Supabase have the exact requested appended phone strings.
- Ran `npm run build`: Production build and type checking passed with 0 errors across all 36/36 routes.

# Pay Debt (Paper Money / Cash Payment) & Counter Debt Settlement

- **added** `supabase/migrations/20261025000017_record_cash_payment.sql` — Added migration defining `record_cash_payment` SQL function, configured cash channels (`CASH-<code>`) across businesses, and updated `on_business_created` to auto-provision cash channels for future business entities. Supports FIFO debt allocation, custom paper receipt references, and instant payment confirmation SMS.
- **added** `src/app/api/payments/cash/route.ts` — Created authenticated endpoint for processing paper money / cash payments. Validates user permissions (`owner`, `admin`, `accountant`, `cashier`), posts approved cash transactions, reduces customer debt obligations, and triggers immediate SMS confirmation delivery.
- **changed** `src/components/payments/pay-debt-modal.tsx` — Streamlined cash settlement modal into a minimal 1-step action: removed redundant manual inputs (Receipt No, Payment Date, Note, and SMS checkbox), allowing instant cash recording with auto-generated receipt numbering, real-time balance calculations, and automatic SMS confirmations.
- **changed** `src/components/obligations/create-obligation-modal.tsx` — Replaced bulky customer card and loud SMS notification with a clean, cohesive summary strip.
- **changed** `src/app/(dashboard)/customers/page.tsx` — Decluttered action buttons: removed the redundant `Ledger` action button from the desktop table and mobile cards. Added clean `Details →` button and row click navigation, and conditionally display `Pay Debt` only when an outstanding balance exists.
- **changed** `src/components/customers/customer-history-modal.tsx` — Placed the statement ledger cleanly under customer details with a dedicated `Full Ledger` view, unified 3-metric summary cards, and immediate refresh on cash repayment.
- **changed** `src/app/(dashboard)/obligations/page.tsx` — Updated action column to use `Details →` rather than a standalone `Ledger` button.
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
