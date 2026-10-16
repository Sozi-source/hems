import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalize_msisdn } from '@/lib/format';

interface IncomingContact {
  fullName: string;
  nickname?: string;
  phone: string;
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { businessId, contacts } = body;

    if (!businessId || !Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json(
        { error: 'Provide a target business and at least one contact to import.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verify user role on this business
    const { data: member } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!member || !['owner', 'admin', 'accountant', 'cashier'].includes(member.role)) {
      return NextResponse.json(
        { error: 'You do not have permission to import customers to this business.' },
        { status: 403 }
      );
    }

    // Check if nickname column exists in database
    let hasNicknameCol = false;
    try {
      const { error: testColError } = await admin
        .from('customers')
        .select('nickname')
        .limit(1);
      hasNicknameCol = !testColError;
    } catch {
      hasNicknameCol = false;
    }

    // Fetch existing customer phones for this business to avoid duplicates
    const { data: existingCustomers } = await admin
      .from('customers')
      .select('id, full_name, phone')
      .eq('business_id', businessId);

    const existingByPhone = new Map<string, { id: string; full_name: string }>();
    (existingCustomers || []).forEach((c) => {
      if (c.phone) {
        existingByPhone.set(c.phone, c);
      }
    });

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Process contacts sequentially or in small chunks
    for (const raw of contacts as IncomingContact[]) {
      const cleanName = (raw.fullName || '').trim().replace(/\s+/g, ' ');
      const cleanNick = (raw.nickname || '').trim().replace(/\s+/g, ' ') || null;
      const cleanPhone = normalize_msisdn(raw.phone);

      if (!cleanName || !cleanPhone || !/^254[17]\d{8}$/.test(cleanPhone)) {
        skippedCount++;
        continue;
      }

      const existing = existingByPhone.get(cleanPhone);

      if (existing) {
        // Customer already exists with this phone. Update nickname if provided
        if (cleanNick) {
          const updatePayload: Record<string, any> = {};
          if (hasNicknameCol) {
            updatePayload.nickname = cleanNick;
          } else {
            updatePayload.notes = `Nickname: ${cleanNick}`;
          }

          const { error: updateError } = await admin
            .from('customers')
            .update(updatePayload)
            .eq('id', existing.id);

          if (!updateError) {
            updatedCount++;
          }
        } else {
          skippedCount++;
        }
      } else {
        // Create new customer
        const insertPayload: Record<string, any> = {
          business_id: businessId,
          full_name: cleanName,
          phone: cleanPhone,
          created_by: user.id,
        };

        if (cleanNick) {
          if (hasNicknameCol) {
            insertPayload.nickname = cleanNick;
          } else {
            insertPayload.notes = `Nickname: ${cleanNick}`;
          }
        }

        const { data: newCust, error: insertError } = await admin
          .from('customers')
          .insert(insertPayload)
          .select('id, customer_no')
          .single();

        if (insertError) {
          errors.push(`Failed to import ${cleanName} (${cleanPhone}): ${insertError.message}`);
          skippedCount++;
        } else {
          createdCount++;
          if (newCust) {
            existingByPhone.set(cleanPhone, { id: newCust.id, full_name: cleanName });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      createdCount,
      updatedCount,
      skippedCount,
      errors: errors.slice(0, 5),
    });
  } catch (err: any) {
    console.error('Phonebook import error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error importing contacts' },
      { status: 500 }
    );
  }
}
