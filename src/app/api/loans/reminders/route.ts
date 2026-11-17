import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    let settingsQuery = supabase.from('loan_reminder_settings').select('*');
    if (businessId && businessId !== 'all' && businessId !== 'MASTER') {
      settingsQuery = settingsQuery.eq('business_id', businessId);
    }
    const { data: settings } = await settingsQuery;

    let logsQuery = supabase
      .from('loan_reminder_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (businessId && businessId !== 'all' && businessId !== 'MASTER') {
      logsQuery = logsQuery.eq('business_id', businessId);
    }
    const { data: logs } = await logsQuery;

    const { data: cronRuns } = await supabase
      .from('cron_job_runs')
      .select('*')
      .eq('job_name', 'loan_reminders')
      .order('started_at', { ascending: false })
      .limit(15);

    return NextResponse.json({
      success: true,
      settings: settings || [],
      logs: logs || [],
      cronRuns: cronRuns || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load reminder settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      businessId,
      reminderTime = '08:00',
      recipientPhones = [],
      inAppEnabled = true,
      pushEnabled = true,
      smsEnabled = true,
    } = body;

    if (!businessId) {
      return NextResponse.json({ error: 'Select a business.' }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(reminderTime)) {
      return NextResponse.json({ error: 'Reminder time must be HH:MM (e.g. 08:00).' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const cleanPhones = Array.isArray(recipientPhones)
      ? recipientPhones.map((p) => String(p).trim()).filter(Boolean)
      : String(recipientPhones || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);

    const { error } = await supabase.from('loan_reminder_settings').upsert(
      {
        business_id: businessId,
        reminder_time: reminderTime,
        recipient_phones: cleanPhones,
        in_app_enabled: Boolean(inAppEnabled),
        push_enabled: Boolean(pushEnabled),
        sms_enabled: Boolean(smsEnabled),
      },
      { onConflict: 'business_id' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to save reminder settings' }, { status: 500 });
  }
}
