import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createEncryptedBackup } from '@/lib/backup/service';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: backups, error } = await supabase
      .from('system_backups')
      .select('id, trigger_type, size_bytes, sha256_checksum, record_counts, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ success: true, backups: backups || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load backups' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: isAdmin } = await supabase.rpc('is_platform_admin');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only owners or admins can create backups.' }, { status: 403 });
    }

    const backup = await createEncryptedBackup('manual', user.id);
    return NextResponse.json({ success: true, backup }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Backup failed' }, { status: 500 });
  }
}
