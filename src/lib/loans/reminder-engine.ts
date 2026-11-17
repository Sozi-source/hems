import { createAdminClient } from '@/lib/supabase/admin';
import { getLoanSmsAdapter } from '@/lib/sms/providers';
import {
  buildLoanReminderMessage,
  evaluateLoanReminderSchedule,
} from './reminder-schedule';

export { buildLoanReminderMessage, evaluateLoanReminderSchedule };
export type { ReminderDecision } from './reminder-schedule';

function getNairobiDateTime(now: Date) {
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const timeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { dateStr, timeStr };
}

export async function runLoanRemindersCheck(now: Date = new Date()) {
  const admin = createAdminClient();
  const { dateStr: todayStr, timeStr: currentTime } = getNairobiDateTime(now);

  const { data: runRow } = await admin
    .from('cron_job_runs')
    .insert({ job_name: 'loan_reminders', status: 'running' })
    .select('id')
    .single();

  let sentCount = 0;
  let failureCount = 0;
  const details: Record<string, any> = { nairobi_date: todayStr, nairobi_time: currentTime };

  try {
    // Load active, non-archived loans with unpaid/unverified instalments
    const { data: loans, error: loansErr } = await admin
      .from('loan_terms')
      .select(`
        obligation_id,
        business_id,
        lender_name,
        payment_details,
        loan_status,
        archived_at,
        businesses!inner ( id, name )
      `)
      .eq('loan_status', 'active')
      .is('archived_at', null);

    if (loansErr) throw loansErr;

    const { data: settingsRows } = await admin
      .from('loan_reminder_settings')
      .select('*');

    const settingsMap = new Map<string, any>();
    for (const s of settingsRows || []) {
      settingsMap.set(s.business_id, s);
    }

    const smsAdapter = getLoanSmsAdapter();
    details.sms_provider = smsAdapter.name;
    details.sms_configured = smsAdapter.isConfigured();

    for (const loan of loans || []) {
      const settings = settingsMap.get(loan.business_id) || {
        reminder_time: '08:00',
        recipient_phones: [],
        in_app_enabled: true,
        push_enabled: true,
        sms_enabled: true,
      };

      // Catch-up: run anytime at or after the configured Nairobi time (default 08:00)
      if (currentTime < (settings.reminder_time || '08:00')) {
        continue;
      }

      const { data: instalments } = await admin
        .from('loan_instalments')
        .select('*')
        .eq('obligation_id', loan.obligation_id)
        .is('verified_at', null)
        .order('instalment_no', { ascending: true });

      for (const inst of instalments || []) {
        const remainingMinor = Math.max(0, Number(inst.instalment_minor) - Number(inst.paid_minor || 0));
        if (remainingMinor <= 0 && inst.verified_at) continue;

        const decision = evaluateLoanReminderSchedule(
          inst.due_date,
          todayStr,
          Boolean(inst.verified_at)
        );
        if (!decision) continue;

        const message = buildLoanReminderMessage({
          lenderName: loan.lender_name,
          businessName: (loan as any).businesses?.name || 'Business',
          amountDueMinor: remainingMinor > 0 ? remainingMinor : Number(inst.instalment_minor),
          dueDateIso: inst.due_date,
          decision,
          paymentDetails: loan.payment_details || {},
        });

        // 1. In-app notification
        if (settings.in_app_enabled) {
          const dedupeKey = `loan_inapp:${loan.obligation_id}:${inst.id}:${todayStr}`;
          const { error: logErr } = await admin.from('loan_reminder_logs').insert({
            business_id: loan.business_id,
            loan_id: loan.obligation_id,
            instalment_id: inst.id,
            reminder_date: todayStr,
            days_offset: decision.daysOffset,
            channel: 'in_app',
            recipient: 'dashboard',
            message,
            status: 'sent',
          });

          if (!logErr) {
            await admin.from('notifications').upsert(
              {
                business_id: loan.business_id,
                kind: 'loan_reminder',
                title: `Loan ${decision.label}: ${loan.lender_name}`,
                body: message,
                obligation_id: loan.obligation_id,
                dedupe_key: dedupeKey,
              },
              { onConflict: 'dedupe_key', ignoreDuplicates: true }
            );
            sentCount++;
          }
        }

        // 2. SMS channel (provider-agnostic; fails gracefully if unconfigured)
        if (settings.sms_enabled && Array.isArray(settings.recipient_phones)) {
          for (const rawPhone of settings.recipient_phones) {
            const phone = String(rawPhone || '').trim();
            if (!phone) continue;

            // Check idempotency before calling external SMS API
            const { data: existingLog } = await admin
              .from('loan_reminder_logs')
              .select('id')
              .eq('loan_id', loan.obligation_id)
              .eq('instalment_id', inst.id)
              .eq('reminder_date', todayStr)
              .eq('channel', 'sms')
              .eq('recipient', phone)
              .maybeSingle();

            if (existingLog) continue;

            if (!smsAdapter.isConfigured()) {
              await admin.from('loan_reminder_logs').insert({
                business_id: loan.business_id,
                loan_id: loan.obligation_id,
                instalment_id: inst.id,
                reminder_date: todayStr,
                days_offset: decision.daysOffset,
                channel: 'sms',
                recipient: phone,
                message,
                status: 'skipped',
                error: `${smsAdapter.name} not configured; fell back to in-app/push`,
              });
              continue;
            }

            const sendRes = await smsAdapter.send(phone, message);
            await admin.from('loan_reminder_logs').insert({
              business_id: loan.business_id,
              loan_id: loan.obligation_id,
              instalment_id: inst.id,
              reminder_date: todayStr,
              days_offset: decision.daysOffset,
              channel: 'sms',
              recipient: phone,
              message,
              status: sendRes.success ? 'sent' : 'failed',
              error: sendRes.error || null,
            });

            if (sendRes.success) sentCount++;
            else failureCount++;
          }
        }
      }
    }

    if (runRow?.id) {
      await admin
        .from('cron_job_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: failureCount > 0 ? 'partial' : 'success',
          reminders_sent: sentCount,
          failures: failureCount,
          details,
        })
        .eq('id', runRow.id);
    }

    return { ok: true, sentCount, failureCount };
  } catch (err: any) {
    if (runRow?.id) {
      await admin
        .from('cron_job_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          reminders_sent: sentCount,
          failures: failureCount + 1,
          details: { ...details, error: err?.message || 'Unknown error' },
        })
        .eq('id', runRow.id);
    }
    return { ok: false, error: err?.message || 'Loan reminders check failed' };
  }
}
