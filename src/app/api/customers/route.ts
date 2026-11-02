import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalize_msisdn } from '@/lib/format';

function validOffsets(value: unknown): value is number[] | null {
  return value === null || (Array.isArray(value) && value.length > 0 && value.length <= 12 &&
    value.every((n) => Number.isInteger(n) && n >= 0 && n <= 365) && new Set(value).size === value.length);
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { customerId } = body;
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    if (typeof customerId !== 'string' || fullName.length < 2 || fullName.length > 120) {
      return NextResponse.json({ error: 'Enter a customer name between 2 and 120 characters.' }, { status: 400 });
    }
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const normalizedPhone = phone ? normalize_msisdn(phone) : null;
    if (phone && !normalizedPhone?.match(/^254[17]\d{8}$/)) return NextResponse.json({ error: 'Enter a valid Kenyan phone number.' }, { status: 400 });
    if (!validOffsets(body.reminderOffsets)) return NextResponse.json({ error: 'Reminder days must be unique whole numbers from 0 to 365, or blank to use business defaults.' }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    const payload: Record<string, unknown> = { full_name: fullName, phone: normalizedPhone, reminder_offsets: body.reminderOffsets };
    if (typeof body.nickname === 'string') payload.nickname = body.nickname.trim().replace(/\s+/g, ' ') || null;
    const { data: customer, error } = await supabase.from('customers').update(payload).eq('id', customerId).select('id, business_id').single();
    if (error) return NextResponse.json({ error: error.code === '42501' ? 'You do not have permission to update this customer.' : error.message }, { status: error.code === '42501' ? 403 : 400 });
    if (body.reminderOffsets !== undefined) {
      const { data: debts } = await supabase.from('obligations').select('id').eq('customer_id', customerId).eq('kind', 'customer_debt').in('status', ['open', 'partially_paid']);
      if (debts?.length) {
        let effectiveOffsets = body.reminderOffsets;
        if (!effectiveOffsets) {
          const { data: settings } = await supabase.from('business_settings').select('default_reminder_offsets').eq('business_id', customer.business_id).maybeSingle();
          effectiveOffsets = settings?.default_reminder_offsets || [3, 7, 14, 30];
        }
        const query = supabase.from('reminder_schedules').update({ offsets_days: effectiveOffsets }).in('obligation_id', debts.map((d) => d.id)).eq('status', 'active');
        const { error: scheduleError } = await query;
        if (scheduleError) return NextResponse.json({ error: 'Customer saved, but active reminder schedules could not be updated.' }, { status: 400 });
      }
    }
    return NextResponse.json({ success: true, customer });
  } catch { return NextResponse.json({ error: 'Server error updating customer.' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  try {
    const { customerId } = await request.json();
    if (typeof customerId !== 'string') return NextResponse.json({ error: 'Customer is required.' }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    // Archive instead of hard delete so debt history and payment references remain intact.
    const { error } = await supabase.from('customers').update({ is_active: false }).eq('id', customerId);
    if (error) return NextResponse.json({ error: error.code === '42501' ? 'You do not have permission to archive this customer.' : error.message }, { status: error.code === '42501' ? 403 : 400 });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Server error archiving customer.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, phone, creditLimitMinor } = body;
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';

    if (typeof businessId !== 'string' || !businessId.trim() || fullName.length < 2 || fullName.length > 120) {
      return NextResponse.json(
        { error: 'Select a business and enter a customer name between 2 and 120 characters.' },
        { status: 400 }
      );
    }

    if (phone !== undefined && phone !== null && typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number must be text.' }, { status: 400 });
    }
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedPhone = cleanPhone ? normalize_msisdn(cleanPhone) : null;
    if (cleanPhone && !normalizedPhone?.match(/^254[17]\d{8}$/)) {
      return NextResponse.json(
        { error: 'Enter a valid Kenyan phone number, such as 0712345678 or 254712345678.' },
        { status: 400 }
      );
    }

    let creditMinor: string | undefined;
    if (creditLimitMinor !== undefined && creditLimitMinor !== null) {
      if (!/^(0|[1-9]\d*)$/.test(String(creditLimitMinor))) {
        return NextResponse.json({ error: 'Credit limit must be a non-negative amount in minor units.' }, { status: 400 });
      }
      try {
        const amount = BigInt(String(creditLimitMinor));
        if (amount > 9223372036854775807n) throw new Error('too large');
        creditMinor = amount.toString();
      } catch {
        return NextResponse.json({ error: 'Credit limit is too large.' }, { status: 400 });
      }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: 'Supabase configuration missing. Please ensure .env.local is configured.' },
        { status: 500 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Customer creation session check failed:', authError.message);
      const rejectedApiKey = authError.code === 'invalid_api_key' || /api key/i.test(authError.message);
      return NextResponse.json(
        { error: rejectedApiKey
          ? 'Supabase rejected the API key. Confirm it belongs to the project URL in .env.local.'
          : 'Supabase rejected the login session. Sign out and sign in again.' },
        { status: 503 }
      );
    }
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to add a customer.' }, { status: 401 });
    }

    // 1. Resolve UUID if businessId is a code (e.g. HARON_FASHION)
    let resolvedBizId = businessId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);

    if (!isUuid) {
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select('id')
        .eq('code', businessId.trim())
        .limit(1)
        .maybeSingle();

      if (bizErr || !biz) {
        return NextResponse.json(
          { error: bizErr?.message || `Business '${businessId}' was not found or you do not have access to it.` },
          { status: 404 }
        );
      }
      resolvedBizId = biz.id;
    }

    if (normalizedPhone) {
      const { data: samePhone, error: duplicateCheckError } = await supabase
        .from('customers')
        .select('id, full_name')
        .eq('business_id', resolvedBizId)
        .eq('phone', normalizedPhone);

      if (duplicateCheckError) {
        console.error('Customer duplicate validation failed:', duplicateCheckError.message);
        return NextResponse.json({ error: 'Could not validate this customer. Please try again.' }, { status: 500 });
      }

      const normalizedName = fullName.toLowerCase().replace(/\s+/g, ' ');
      if (samePhone?.some((candidate) => candidate.full_name.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedName)) {
        return NextResponse.json(
          { error: 'This customer name and phone number already exist in this business.' },
          { status: 409 }
        );
      }
    }

    const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : null;

    // 2. Prepare payload
    const payload: Record<string, any> = {
      business_id: resolvedBizId,
      full_name: fullName.trim(),
    };

    if (normalizedPhone) payload.phone = normalizedPhone;
    if (creditMinor !== undefined) payload.credit_limit_minor = creditMinor;

    // Attempt to store nickname in column if migrated, otherwise fallback to notes
    if (nickname) {
      try {
        const { error: colCheck } = await supabase.from('customers').select('nickname').limit(1);
        if (!colCheck) {
          payload.nickname = nickname;
        } else {
          payload.notes = `Nickname: ${nickname}`;
        }
      } catch {
        payload.notes = `Nickname: ${nickname}`;
      }
    }

    // 3. Insert customer
    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert(payload)
      .select('id, customer_no, full_name, phone, business_id')
      .single();

    if (insertError) {
      if (insertError.message?.includes('Invalid Kenyan phone number')) {
        return NextResponse.json(
          { error: 'Please enter a valid Kenyan phone number (e.g. 0712345678 or 254712345678).' },
          { status: 400 }
        );
      }
      if (insertError.code === '23505' && /name and phone|customers_name_phone_unique/i.test(
        `${insertError.message} ${insertError.details || ''}`
      )) {
        return NextResponse.json(
          { error: 'This customer name and phone number already exist in this business.' },
          { status: 409 }
        );
      }
      if (insertError.code === '42501' || insertError.message?.toLowerCase().includes('row-level security')) {
        return NextResponse.json(
          { error: 'You do not have permission to add customers to this business.' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: insertError.message || 'Failed to create customer.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, customer });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Server error creating customer.' },
      { status: 500 }
    );
  }
}
