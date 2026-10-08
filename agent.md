# agent.md — READ THIS FIRST, EVERY SESSION

> **Rule 0.** Before touching anything in this repo, read **this file** and **`changes.md`**.
> After finishing any piece of work, **update `changes.md`** (and this file if a rule, decision or structure changed).
> Never skip this. The client is extremely careful about this system: money is involved.

## 1. What HEMS is
**HEMS — Haron Enterprise Management System.** One app that runs several separate businesses with completely
separate records, plus a Master view that combines figures.

| Code | Business |
|---|---|
| `HARON_FASHION` | Haron Fashion (fashion) |
| `ZENITH_PLAST` | Zenith Plast Distributors Ltd (household plastics distribution) |
| future | Added as a new row in `businesses`. **No code changes may be required.** |

Each business has its **own Paybill**. A Paybill/shortcode belongs to exactly one business
(`payment_channels`, unique on `(provider, shortcode)`), so payments through Daraja are attributed deterministically.

## 2. Product quality bar
- It must feel like a **fintech/ERP app** (think Stripe Dashboard on desktop, Revolut/M-Pesa patterns on mobile), **not a website**.
- Mobile-first PWA (installable) that also works as a full responsive web app on every screen size.
- **Do NOT use default/native AI styling or stock shadcn look.** Build our own design tokens (colour, type, spacing,
  radius, elevation) and well-designed cards/components. The client has not approved a UI yet: use the most trusted,
  reputable fintech patterns until told otherwise.
- Smooth, fast, forgiving UX. The user should rate it highly.

## 3. Stack
Next.js (App Router, TypeScript, `src/` directory) · Supabase (Postgres, Auth, RLS, Edge Functions, pg_cron) ·
Deploy: Vercel or Cloudflare (frontend), custom domain later · SMS provider: to be chosen in Phase 3 (Africa's Talking is the default candidate).
**Payments: Safaricom Daraja directly** (C2B Paybill + STK Push). Paystack is NOT the primary rail (it cannot see
payments sent directly to a Paybill). It may be added later for cards/bank only.

## 4. Repo layout
```
agent.md  changes.md
src/                         Next.js app (Phase 0b onward)
supabase/
  migrations/                ordered SQL. THE source of truth for the data model
  seed.sql                   the two businesses (+ first-owner instructions)
  tests/
    _stub_supabase.sql       fake auth/roles so migrations run on plain Postgres
    001_core_workflow.sql    end-to-end workflow tests (rolled back)
    run_tests.sh             rebuild a throwaway DB and run everything
```

## 5. NON-NEGOTIABLE RULES
1. **Business isolation.** Every business-owned table has `business_id`. Cross-table references are *composite*
   FKs `(id, business_id)`. RLS restricts every read/write to businesses the user belongs to. Never query without
   scoping to a business in the UI (except the Master view, which RLS still filters).
2. **Money is `bigint` minor units** (cents). KSh 10,000 = `1000000`. Never floats. Format only at the edge (`fmt_kes`).
3. **Balances are never edited.** `obligations.balance_minor/status` are maintained by a trigger from the append-only
   `obligation_entries`. Corrections are **reversals**, not edits/deletes. A DB guard blocks direct edits.
4. **Nothing changes a debt without approval.** Every payment is created `pending`. Only `approve_payment()` posts
   entries. Browser users cannot insert payments, entries, or allocations directly (no RLS write policies).
5. **No duplicate payments.** `unique(provider, transaction_ref)` + content-hash log (`payment_ingest_log`).
   Same SMS read N times = 1 payment. Same transaction via C2B and SMS = merged (enriched), never duplicated.
6. **Uncertain = Pending.** If a payment cannot be confidently tied to a business, `business_id` stays NULL and it sits
   in the owner/admin-only unassigned inbox until assigned. Never guess a business, customer or name.
7. **Confirmation SMS only after approval**, from an editable template; "PAID IN FULL" when cleared; reminders stop
   automatically when a debt is cleared and resume with the *current* balance after partial payment / reversal.
8. **Verified identity** (name/phone from STK/C2B/SMS) is stored only if the provider returned it. Never generated.
   It is one matching factor among many — never the only one.
9. **All money-moving logic lives in SQL functions** (`supabase/migrations/*_workflow_functions.sql`), not in the
   frontend. The frontend calls these via RPC. If you need new money logic, add/modify a function + a test.
10. **Secrets never reach the client.** Daraja keys, SMS keys, service-role key live in server env / Supabase Vault.
    `payment_channels.secret_ref` stores only the *name* of a secret.
11. **Server-only functions** (`ingest_payment`, `queue_due_reminders`, `generate_recurring_obligations`,
    `log_parse_failure`) are revoked from `authenticated`. Call them only from Edge Functions/cron using the service role.
12. **Audit everything important.** `audit_log` is immutable and written by triggers (who, when, before/after).
13. **Never edit an applied migration.** Add a new numbered migration. (Phase 1 files are still unreleased, so they may be
    amended until the first production deploy; after that they are frozen.)
14. **Every change ships with a test** in `supabase/tests/` and the full suite must pass before commit.
15. **Dates are business-local.** Use `business_today(business_id)`; the DB runs in UTC, Nairobi is UTC+3.

## 6. Data model in one paragraph
`obligations` is the unified engine for customer debts, supplier debts, loans, bills, expenses, salaries and staff
advances (`kind` + `direction`). `obligation_entries` is its append-only journal (charge, interest, payment,
adjustment, write_off, reversal). Loans add `loan_terms`. `recurring_templates` spawn future obligations.
Payments flow `payment_ingest_log → payment_transactions (pending) → match_candidates → approve_payment →
payment_allocations + obligation_entries → sms_outbox`. Reminders: `reminder_schedules` (auto-created per obligation) →
`reminder_runs` (one per cycle/offset) → `sms_outbox`. Reporting uses `security_invoker` views (`v_*`).
Customer number (`C0001`) doubles as the **Paybill account number**, which makes matching near-deterministic.

## 7. Roles
`owner` (everything, members, channels) · `admin` · `accountant` (approve/reject, manage records) ·
`cashier` (customers, credit sales; cannot approve) · `viewer` (read). Per business. Unassigned payments and the audit log are owner/admin only.

## 8. Daraja notes (verify against current Daraja docs before building Phase 2)
- C2B: register validation/confirmation URLs per shortcode. Confirmation gives receipt, amount, time, BillRefNumber
  (account no.), and payer MSISDN — **possibly hashed** in newer API versions (we store `payer_msisdn_sha256`).
- STK Push callback returns receipt, amount, time and phone — **not a payer name**. The name, when available, comes from
  the C2B confirmation/SMS and is attached by matching the **receipt number**.
- Must be idempotent: Safaricom can retry callbacks. `ingest_payment` already is.

## 9. Testing
`./supabase/tests/run_tests.sh` (needs local Postgres 15+). Must print `ALL TESTS PASSED`.
Tests run on plain Postgres with a stubbed `auth` schema; before production also run them on `supabase start`.

## 10. Current phase status
See `changes.md` (top entry = latest). Roadmap: 0 foundation → 1 database (done, tested) → **0b Next.js scaffold +
design system (done, verified)** → 2 payment pipeline (Daraja C2B/STK, SMS parser, matching engine) → 3 SMS pipeline → 4 financial
modules UI (+ sales/stock/payroll tables) → 5 UI polish & reports → 6 security hardening & production.

## 11. Known gaps / deferred (do not forget)
- Match-scoring engine (tables ready; scoring logic is Phase 2).
- Sales, stock, payroll runs, intercompany transfers, eTIMS/VAT, reducing-balance loans, bank reconciliation: not yet modelled.
- pg_cron schedules (`queue_due_reminders` every few minutes, `generate_recurring_obligations` daily) not created yet.
- SMS sender worker + delivery-report webhook (Phase 3).
- Kenya Data Protection Act: consent capture, retention policy, ODPC registration (business task).
