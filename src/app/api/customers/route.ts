import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, fullName, phone, creditLimitMinor } = body;

    if (!businessId || !fullName?.trim()) {
      return NextResponse.json(
        { error: 'Business and customer full name are required.' },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: 'Supabase configuration missing. Please ensure .env.local is configured.' },
        { status: 500 }
      );
    }

    const admin = createAdminClient();

    // 1. Resolve UUID if businessId is a code (e.g. HARON_FASHION)
    let resolvedBizId = businessId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId);

    if (!isUuid) {
      const { data: biz, error: bizErr } = await admin
        .from('businesses')
        .select('id')
        .eq('code', businessId)
        .limit(1)
        .maybeSingle();

      if (bizErr || !biz) {
        return NextResponse.json(
          { error: `Business with code '${businessId}' not found in database.` },
          { status: 400 }
        );
      }
      resolvedBizId = biz.id;
    }

    // 2. Prepare payload
    const payload: Record<string, any> = {
      business_id: resolvedBizId,
      full_name: fullName.trim(),
    };

    if (phone?.trim()) {
      payload.phone = phone.trim();
    }

    if (creditLimitMinor && Number(creditLimitMinor) > 0) {
      payload.credit_limit_minor = Number(creditLimitMinor);
    }

    // 3. Insert customer
    const { data: customer, error: insertError } = await admin
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
