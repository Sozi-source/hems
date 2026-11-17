import { createAdminClient } from '@/lib/supabase/admin';
import { decryptBackupJson, encryptBackupJson } from './crypto';

const BACKUP_TABLES = [
  'businesses',
  'business_settings',
  'customers',
  'suppliers',
  'obligations',
  'loan_terms',
  'loan_instalments',
  'loan_payments',
  'loan_payment_allocations',
  'loan_reminder_settings',
  'sms_templates',
] as const;

export async function createEncryptedBackup(
  triggerType: 'manual' | 'scheduled',
  userId: string | null = null
) {
  const admin = createAdminClient();
  const snapshot: Record<string, any[]> = {};
  const recordCounts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    const { data, error } = await admin.from(table).select('*');
    if (error) {
      throw new Error(`Failed to export ${table}: ${error.message}`);
    }
    snapshot[table] = data || [];
    recordCounts[table] = (data || []).length;
  }

  const payload = JSON.stringify({
    version: 1,
    created_at: new Date().toISOString(),
    tables: snapshot,
  });

  const encrypted = encryptBackupJson(payload);

  const { data: inserted, error: insertErr } = await admin
    .from('system_backups')
    .insert({
      created_by: userId,
      trigger_type: triggerType,
      size_bytes: encrypted.size_bytes,
      sha256_checksum: encrypted.sha256_checksum,
      encrypted_payload: encrypted.encrypted_payload,
      iv: encrypted.iv,
      auth_tag: encrypted.auth_tag,
      record_counts: recordCounts,
    })
    .select('id, trigger_type, size_bytes, sha256_checksum, record_counts, created_at')
    .single();

  if (insertErr) throw insertErr;

  // Keep only the last N backups (default 10)
  const keepN = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT || 10));
  const { data: allBackups } = await admin
    .from('system_backups')
    .select('id')
    .order('created_at', { ascending: false });

  if (allBackups && allBackups.length > keepN) {
    const toDelete = allBackups.slice(keepN).map((b) => b.id);
    await admin.from('system_backups').delete().in('id', toDelete);
  }

  return inserted;
}

export async function restoreEncryptedBackup(backupId: string) {
  const admin = createAdminClient();
  const { data: backup, error } = await admin
    .from('system_backups')
    .select('*')
    .eq('id', backupId)
    .maybeSingle();

  if (error) throw error;
  if (!backup) throw new Error('Backup not found.');

  const plaintext = decryptBackupJson({
    encrypted_payload: backup.encrypted_payload,
    iv: backup.iv,
    auth_tag: backup.auth_tag,
    sha256_checksum: backup.sha256_checksum,
  });

  const parsed = JSON.parse(plaintext);
  if (!parsed?.tables || typeof parsed.tables !== 'object') {
    throw new Error('Invalid backup format.');
  }

  const restoredCounts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = parsed.tables[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      restoredCounts[table] = 0;
      continue;
    }

    const conflictCol =
      table === 'business_settings' || table === 'loan_reminder_settings'
        ? 'business_id'
        : table === 'loan_terms'
          ? 'obligation_id'
          : 'id';

    const { error: upsertErr } = await admin
      .from(table)
      .upsert(rows, { onConflict: conflictCol });

    if (upsertErr) {
      throw new Error(`Restore failed on ${table}: ${upsertErr.message}`);
    }
    restoredCounts[table] = rows.length;
  }

  return { backupId, restoredCounts };
}
