import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({
        businesses: [],
        warning: 'Supabase URL or public API key is not set in .env.local',
      });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('Business list session check failed:', authError.message);
      const rejectedApiKey = authError.code === 'invalid_api_key' || /api key/i.test(authError.message);
      return NextResponse.json(
        { businesses: [], error: rejectedApiKey
          ? 'Supabase rejected the API key. Confirm it belongs to the project URL in .env.local.'
          : 'Supabase rejected the login session. Sign out and sign in again.' },
        { status: 503 }
      );
    }
    if (!user) {
      return NextResponse.json({ businesses: [], error: 'Please sign in to load businesses.' }, { status: 401 });
    }

    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, code, name, legal_name')
      .order('name');

    if (error) {
      return NextResponse.json({ businesses: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ businesses: businesses || [] });
  } catch (err: any) {
    return NextResponse.json({
      businesses: [],
      error: err?.message || 'Failed to fetch businesses',
    }, { status: 500 });
  }
}
