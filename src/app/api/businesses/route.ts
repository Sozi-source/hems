import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({
        businesses: [],
        warning: 'NEXT_PUBLIC_SUPABASE_URL is not set in .env.local',
      });
    }

    const admin = createAdminClient();
    const { data: businesses, error } = await admin
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
