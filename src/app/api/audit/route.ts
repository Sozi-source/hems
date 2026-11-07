import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmt_kes } from '@/lib/format';

export const runtime = 'nodejs';

function describeAuditEvent(item: any): string {
  const table = item.table_name;
  const action = item.action;
  const n = item.new_data || {};
  const o = item.old_data || {};

  switch (table) {
    case 'customers':
      if (action === 'INSERT') {
        return `Added customer "${n.full_name || 'Customer'}" (${n.customer_no || ''}) ${n.phone ? `· ${n.phone}` : ''}`;
      }
      if (action === 'UPDATE') {
        return `Updated details for customer "${n.full_name || o.full_name || 'Customer'}" (${n.customer_no || o.customer_no || ''})`;
      }
      return `Deleted customer "${o.full_name || 'Customer'}"`;

    case 'obligations':
      if (action === 'INSERT') {
        const amt = n.original_minor ? fmt_kes(n.original_minor) : '';
        const kindLabel = n.kind === 'customer_debt' ? 'Customer Debt' : n.kind === 'supplier_debt' ? 'Supplier Debt' : n.kind || 'Debt';
        return `Recorded ${kindLabel} ${n.reference_no ? `[${n.reference_no}]` : ''} of ${amt}`;
      }
      if (action === 'UPDATE') {
        if (n.status !== o.status) {
          return `Updated debt status from "${o.status}" to "${n.status}" for [${n.reference_no || o.reference_no}]`;
        }
        if (n.balance_minor !== o.balance_minor) {
          return `Balance adjusted on [${n.reference_no || o.reference_no}]: now ${fmt_kes(n.balance_minor)}`;
        }
        return `Updated debt record [${n.reference_no || o.reference_no}]`;
      }
      return `Deleted debt record [${o.reference_no}]`;

    case 'payment_transactions':
      if (action === 'INSERT') {
        const amt = n.amount_minor ? fmt_kes(n.amount_minor) : '';
        const prov = n.provider === 'cash' ? 'Cash' : n.provider === 'mpesa_c2b' ? 'M-Pesa C2B' : n.provider || 'Payment';
        return `Recorded ${prov} payment [${n.transaction_ref}] of ${amt} (${n.payer_name || 'Counter party'})`;
      }
      if (action === 'UPDATE') {
        if (n.status !== o.status) {
          return `Payment [${n.transaction_ref || o.transaction_ref}] status changed to "${n.status}"`;
        }
        return `Updated payment [${n.transaction_ref || o.transaction_ref}]`;
      }
      return `Deleted payment transaction`;

    case 'business_members':
      if (action === 'INSERT') {
        const role = n.role || n.allocated_role || 'role';
        return `Allocated employee rights: Assigned role "${role.toUpperCase()}"`;
      }
      if (action === 'UPDATE') {
        const role = n.role || o.role;
        const status = n.is_active === false ? 'Suspended' : 'Active';
        return `Updated employee rights: Role "${role?.toUpperCase()}" (${status})`;
      }
      return `Removed employee membership`;

    case 'sms_templates':
      return `Modified SMS template [${n.key || o.key}]`;

    case 'payment_channels':
      return `${action === 'INSERT' ? 'Added' : 'Updated'} payment channel [${n.label || o.label || n.shortcode || o.shortcode}]`;

    default:
      return `${action} on ${table}`;
  }
}

// GET /api/audit
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const actorId = searchParams.get('actorId');
    const tableName = searchParams.get('tableName');
    const action = searchParams.get('action');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify caller has role owner or admin
    let roleQuery = admin
      .from('business_members')
      .select('role, business_id')
      .eq('user_id', currentUser.id)
      .eq('is_active', true);

    if (businessId) {
      roleQuery = roleQuery.eq('business_id', businessId);
    }

    const { data: callerRoles } = await roleQuery;
    const canViewAudit = (callerRoles || []).some((r) => ['owner', 'admin'].includes(r.role));

    if (!canViewAudit) {
      return NextResponse.json({ error: 'Only owners and administrators can access the audit trail.' }, { status: 403 });
    }

    // Build audit query
    let query = admin
      .from('audit_log')
      .select('id, occurred_at, business_id, actor_id, actor_label, action, table_name, record_id, old_data, new_data, client_ip', { count: 'exact' })
      .order('occurred_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (businessId) {
      query = query.eq('business_id', businessId);
    }
    if (actorId) {
      query = query.eq('actor_id', actorId);
    }
    if (tableName) {
      query = query.eq('table_name', tableName);
    }
    if (action) {
      query = query.eq('action', action.toUpperCase());
    }

    const { data: logs, count, error: auditErr } = await query;
    if (auditErr) {
      return NextResponse.json({ error: auditErr.message }, { status: 500 });
    }

    // Fetch user details for actors
    const actorIds = Array.from(new Set((logs || []).map((l) => l.actor_id).filter(Boolean)));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds);

    const { data: authUsersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authUsersData?.users || [];

    const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));
    const authUserMap = new Map(authUsers.map((u) => [u.id, u.email]));

    // Format logs with human descriptions and actor details
    const enrichedLogs = (logs || []).map((item) => {
      const email = item.actor_id ? authUserMap.get(item.actor_id) : null;
      const name = item.actor_id ? profileMap.get(item.actor_id) : null;
      const actorName = name || email || item.actor_label || (item.actor_id ? 'Employee' : 'System');

      return {
        id: item.id,
        occurred_at: item.occurred_at,
        business_id: item.business_id,
        actor_id: item.actor_id,
        actor_name: actorName,
        actor_email: email || item.actor_label,
        action: item.action,
        table_name: item.table_name,
        record_id: item.record_id,
        summary: describeAuditEvent(item),
        old_data: item.old_data,
        new_data: item.new_data,
        client_ip: item.client_ip,
      };
    });

    // Provide actor filters
    const actors = authUsers
      .filter((u) => actorIds.includes(u.id))
      .map((u) => ({
        id: u.id,
        name: profileMap.get(u.id) || u.user_metadata?.full_name || u.email,
        email: u.email,
      }));

    return NextResponse.json({
      logs: enrichedLogs,
      totalCount: count || 0,
      actors,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Audit trail API error:', error);
    return NextResponse.json({ error: 'Failed to retrieve audit trail' }, { status: 500 });
  }
}
