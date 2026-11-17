import { NextResponse } from 'next/server';
import { matchesConfiguredSecret } from '@/lib/security/secret-match';
import { processSmsQueue } from '@/lib/sms/processor';
import { runLoanRemindersCheck } from '@/lib/loans/reminder-engine';
import { createEncryptedBackup } from '@/lib/backup/service';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) return false;
  const supplied = authorization.slice(7);
  return [process.env.SMS_WORKER_SECRET, process.env.CRON_SECRET]
    .some((secret) => matchesConfiguredSecret(secret, supplied));
}

async function runWorker(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processSmsQueue();
  let loanReminders: any = null;
  try {
    loanReminders = await runLoanRemindersCheck();
  } catch (err) {
    console.error('runLoanRemindersCheck warning:', err);
  }

  let scheduledBackup: any = null;
  try {
    if (process.env.BACKUP_ENCRYPTION_KEY) {
      const nairobiDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const nairobiHour = Number(
        new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false })
      );
      if (nairobiHour >= 2) {
        const admin = createAdminClient();
        const { data: existing } = await admin
          .from('system_backups')
          .select('id')
          .eq('trigger_type', 'scheduled')
          .gte('created_at', `${nairobiDate}T00:00:00+03:00`)
          .limit(1);
        if (!existing || existing.length === 0) {
          scheduledBackup = await createEncryptedBackup('scheduled', null);
        }
      }
    }
  } catch (err) {
    console.error('scheduledBackup warning:', err);
  }

  if (result.error) {
    return NextResponse.json({ error: result.error, loanReminders, scheduledBackup }, { status: result.status });
  }
  return NextResponse.json({ ...result.data, loanReminders, scheduledBackup }, { status: result.status });
}

// Vercel Cron invokes scheduled routes with GET and an Authorization bearer token.
export async function GET(request: Request) {
  return runWorker(request);
}

// Keep POST available for manual or external scheduler invocations.
export async function POST(request: Request) {
  return runWorker(request);
}
