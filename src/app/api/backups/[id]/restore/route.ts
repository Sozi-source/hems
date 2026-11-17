import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { restoreEncryptedBackup } from '@/lib/backup/service';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    if (body.confirmed !== true) {
      return NextResponse.json({ error: 'Restore confirmation is required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: isAdmin } = await supabase.rpc('is_platform_admin');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only owners or admins can restore backups.' }, { status: 403 });
    }

    const result = await restoreEncryptedBackup(id);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Restore failed' }, { status: 500 });
  }
}
