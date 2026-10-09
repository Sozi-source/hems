import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const requestedNext = requestUrl.searchParams.get('next');
  let destination = new URL('/', requestUrl.origin);
  if (requestedNext?.startsWith('/')) {
    const candidate = new URL(requestedNext, requestUrl.origin);
    if (candidate.origin === requestUrl.origin) destination = candidate;
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(new URL('/login?auth_error=link', requestUrl.origin));
}
