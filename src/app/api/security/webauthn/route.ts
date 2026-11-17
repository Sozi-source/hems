import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: creds } = await supabase
      .from('user_webauthn_credentials')
      .select('credential_id, device_name, created_at')
      .eq('user_id', user.id);

    const challenge = crypto.randomBytes(32).toString('base64url');
    return NextResponse.json({
      success: true,
      challenge,
      userId: user.id,
      userEmail: user.email || 'hems-user',
      credentials: creds || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to prepare WebAuthn' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, credentialId, publicKey, deviceName } = body;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    if (action === 'register') {
      if (!credentialId || !publicKey) {
        return NextResponse.json({ error: 'Invalid credential payload.' }, { status: 400 });
      }
      const { error } = await supabase.from('user_webauthn_credentials').upsert(
        {
          user_id: user.id,
          credential_id: credentialId,
          public_key: publicKey,
          device_name: deviceName || 'This device',
        },
        { onConflict: 'credential_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await supabase
        .from('user_security_settings')
        .upsert({ user_id: user.id, biometrics_enabled: true }, { onConflict: 'user_id' });

      return NextResponse.json({ success: true });
    }

    if (action === 'verify') {
      const { data: cred } = await supabase
        .from('user_webauthn_credentials')
        .select('id')
        .eq('user_id', user.id)
        .eq('credential_id', credentialId)
        .maybeSingle();

      if (!cred) {
        return NextResponse.json({ error: 'Unrecognized biometric credential.' }, { status: 403 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported WebAuthn action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'WebAuthn failed' }, { status: 500 });
  }
}
