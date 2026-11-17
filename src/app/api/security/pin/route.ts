import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const [{ data: sec }, { count: credCount }] = await Promise.all([
      supabase.from('user_security_settings').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('user_webauthn_credentials')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    return NextResponse.json({
      success: true,
      biometricsEnabled: Boolean(sec?.biometrics_enabled),
      hasPin: Boolean(sec?.pin_hash),
      hasWebAuthn: (credCount || 0) > 0,
      lockTimeoutSeconds: sec?.lock_timeout_seconds ?? 60,
      lockedUntil: sec?.locked_until || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load security settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, pin, currentPin, enabled, lockTimeoutSeconds } = body;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const { data: existing } = await supabase
      .from('user_security_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (action === 'set_pin') {
      if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
        return NextResponse.json({ error: 'PIN must be 4 to 8 digits.' }, { status: 400 });
      }
      if (existing?.pin_hash) {
        if (typeof currentPin !== 'string' || !existing.pin_salt) {
          return NextResponse.json({ error: 'Enter your current PIN first.' }, { status: 400 });
        }
        const expected = Buffer.from(existing.pin_hash, 'hex');
        const actual = Buffer.from(hashPin(currentPin, existing.pin_salt), 'hex');
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
          return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 403 });
        }
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const hashed = hashPin(pin, salt);

      const { error } = await supabase.from('user_security_settings').upsert(
        {
          user_id: user.id,
          pin_hash: hashed,
          pin_salt: salt,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: 'user_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (action === 'verify_pin') {
      if (!existing?.pin_hash || !existing?.pin_salt) {
        return NextResponse.json({ error: 'No PIN configured.' }, { status: 400 });
      }
      if (existing.locked_until && new Date(existing.locked_until) > new Date()) {
        return NextResponse.json(
          { error: `Too many failed attempts. Try again after ${new Date(existing.locked_until).toLocaleTimeString()}.`, lockedUntil: existing.locked_until },
          { status: 423 }
        );
      }

      const expected = Buffer.from(existing.pin_hash, 'hex');
      const actual = Buffer.from(hashPin(String(pin || ''), existing.pin_salt), 'hex');
      const matched = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

      if (!matched) {
        const nextAttempts = (existing.failed_attempts || 0) + 1;
        const lockedUntil =
          nextAttempts >= MAX_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString()
            : null;

        await supabase
          .from('user_security_settings')
          .update({
            failed_attempts: lockedUntil ? 0 : nextAttempts,
            locked_until: lockedUntil,
          })
          .eq('user_id', user.id);

        return NextResponse.json(
          {
            error: lockedUntil
              ? `Too many failed attempts. Locked for ${LOCKOUT_MINUTES} minutes.`
              : `Incorrect PIN. ${MAX_ATTEMPTS - nextAttempts} attempt(s) remaining.`,
            lockedUntil,
          },
          { status: 403 }
        );
      }

      await supabase
        .from('user_security_settings')
        .update({ failed_attempts: 0, locked_until: null })
        .eq('user_id', user.id);

      return NextResponse.json({ success: true });
    }

    if (action === 'update_settings') {
      const updates: Record<string, any> = { user_id: user.id };
      if (typeof enabled === 'boolean') updates.biometrics_enabled = enabled;
      if (Number.isInteger(Number(lockTimeoutSeconds))) {
        updates.lock_timeout_seconds = Math.min(3600, Math.max(5, Number(lockTimeoutSeconds)));
      }
      const { error } = await supabase
        .from('user_security_settings')
        .upsert(updates, { onConflict: 'user_id' });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Security operation failed' }, { status: 500 });
  }
}
