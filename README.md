# HEMS — Haron Enterprise Management System

Multi-business ERP & financial obligations ledger built with Next.js (App Router, TypeScript) and Supabase (Postgres, Auth, RLS).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your Supabase, Daraja, Mobiwaves, and Backup keys:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `MOBIWAVES_API_URL`, `MOBIWAVES_API_KEY`, `MOBIWAVES_SENDER_ID`
   - `CRON_SECRET` / `SMS_WORKER_SECRET`
   - `BACKUP_ENCRYPTION_KEY` (required for encrypted backup & restore; minimum 16 characters)
3. Apply database migrations in `supabase/migrations/` in order.
4. Run unit tests:
   ```bash
   node --test src/lib/loans/__tests__/loans.test.ts
   ```
5. Build and start:
   ```bash
   npm run build
   npm start
   ```

## Scheduler Configuration (8:00 AM Africa/Nairobi Loan Reminders & Daily Backups)

The Cloudflare Worker in `cloudflare-sms-cron/` runs every minute (`* * * * *`) and calls `GET /api/sms/worker` with `Authorization: Bearer <CRON_SECRET>`.
On each run:
1. Customer debt reminders & Mobiwaves SMS queue are processed.
2. `runLoanRemindersCheck()` checks all active business loans against `Africa/Nairobi` time (default `08:00`). If the server was offline at 08:00 AM, the next run catches up automatically, and `loan_reminder_logs` enforces per-instalment, per-day, per-channel idempotency.
3. If `BACKUP_ENCRYPTION_KEY` is configured, an automated daily encrypted backup is created once per day after 02:00 AM `Africa/Nairobi`, retaining the last `BACKUP_RETENTION_COUNT` (default `10`) versions.

## SMS Configuration

- **Default Production Provider**: **Mobiwaves** (`MOBIWAVES_API_KEY`, `MOBIWAVES_SENDER_ID`, `MOBIWAVES_API_URL`).
- **Optional Adapter**: Set `LOAN_SMS_PROVIDER=africas_talking` with `AFRICASTALKING_API_KEY`, `AFRICASTALKING_USERNAME`, `AFRICASTALKING_SENDER_ID`, and `AFRICASTALKING_ENV` (`production` or `sandbox`).
- If SMS credentials are missing, loan reminders fail gracefully and still deliver to In-App Notifications (`notifications`) and Push channels.
