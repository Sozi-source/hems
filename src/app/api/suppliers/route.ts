import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalize_msisdn } from '@/lib/format';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to view suppliers.' }, { status: 401 });
    }

    let query = supabase
      .from('suppliers')
      .select('id, business_id, supplier_no, name, phone, email, payment_terms_days, payment_terms_note, notes, is_active, created_at, updated_at')
      .eq('is_active', true)
      .order('name');

    if (businessId && businessId !== 'all') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);
      if (isUuid) {
        query = query.eq('business_id', businessId);
      } else {
        const { data: biz } = await supabase.from('businesses').select('id').eq('code', businessId).maybeSingle();
        if (biz?.id) {
          query = query.eq('business_id', biz.id);
        }
      }
    }

    const { data: suppliers, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, suppliers: suppliers || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, phone, email, paymentTermsDays, paymentTermsNote, notes } = body;
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';

    if (typeof businessId !== 'string' || !businessId.trim() || name.length < 2 || name.length > 120) {
      return NextResponse.json(
        { error: 'Select a business and enter a supplier name between 2 and 120 characters.' },
        { status: 400 }
      );
    }

    let cleanPhone: string | null = null;
    if (typeof phone === 'string' && phone.trim()) {
      const normalized = normalize_msisdn(phone.trim());
      if (/^254[17]\d{8}$/.test(normalized)) {
        cleanPhone = normalized;
      } else {
        return NextResponse.json(
          { error: 'Enter a valid Kenyan phone number, such as 0712345678 or 254712345678.' },
          { status: 400 }
        );
      }
    }

    let cleanEmail: string | null = null;
    if (typeof email === 'string' && email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      }
      cleanEmail = email.trim().toLowerCase();
    }

    const termsDays = Number.isInteger(Number(paymentTermsDays)) && Number(paymentTermsDays) >= 0
      ? Number(paymentTermsDays)
      : 0;

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to add a supplier.' }, { status: 401 });
    }

    // Resolve UUID if businessId is code
    let resolvedBizId = businessId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);
    if (!isUuid) {
      const { data: biz } = await supabase.from('businesses').select('id').eq('code', businessId).maybeSingle();
      if (!biz?.id) {
        return NextResponse.json({ error: 'Selected business was not found.' }, { status: 404 });
      }
      resolvedBizId = biz.id;
    }

    const { data: supplier, error: insertError } = await supabase
      .from('suppliers')
      .insert({
        business_id: resolvedBizId,
        name,
        phone: cleanPhone,
        email: cleanEmail,
        payment_terms_days: termsDays,
        payment_terms_note: typeof paymentTermsNote === 'string' ? paymentTermsNote.trim() : null,
        notes: typeof notes === 'string' ? notes.trim() : null,
        is_active: true,
      })
      .select('id, business_id, supplier_no, name, phone, email, payment_terms_days, payment_terms_note, notes, is_active')
      .single();

    if (insertError) {
      console.error('Failed to insert supplier:', insertError);
      return NextResponse.json(
        { error: insertError.message.includes('unique') ? 'A supplier with this name already exists in this business.' : insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, supplier });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to add supplier' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, name, phone, email, paymentTermsDays, paymentTermsNote, notes, isActive } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Supplier ID is required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to update supplier.' }, { status: 401 });
    }

    const updatePayload: Record<string, any> = {};
    if (typeof name === 'string' && name.trim()) {
      updatePayload.name = name.trim().replace(/\s+/g, ' ');
    }
    if (phone !== undefined) {
      if (typeof phone === 'string' && phone.trim()) {
        const normalized = normalize_msisdn(phone.trim());
        if (/^254[17]\d{8}$/.test(normalized)) {
          updatePayload.phone = normalized;
        } else {
          return NextResponse.json({ error: 'Enter a valid Kenyan phone number.' }, { status: 400 });
        }
      } else {
        updatePayload.phone = null;
      }
    }
    if (email !== undefined) {
      if (typeof email === 'string' && email.trim()) {
        updatePayload.email = email.trim().toLowerCase();
      } else {
        updatePayload.email = null;
      }
    }
    if (paymentTermsDays !== undefined) {
      updatePayload.payment_terms_days = Number(paymentTermsDays) || 0;
    }
    if (paymentTermsNote !== undefined) {
      updatePayload.payment_terms_note = paymentTermsNote?.trim() || null;
    }
    if (notes !== undefined) {
      updatePayload.notes = notes?.trim() || null;
    }
    if (typeof isActive === 'boolean') {
      updatePayload.is_active = isActive;
    }

    const { data: updated, error } = await supabase
      .from('suppliers')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, supplier: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update supplier' }, { status: 500 });
  }
}
