import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filterBusinessId = searchParams.get('businessId');

    const sessionClient = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: please sign in.' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify requesting user is an owner or admin on at least one business
    const { data: adminMemberships, error: memError } = await admin
      .from('business_members')
      .select('business_id, role, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (memError || !adminMemberships || adminMemberships.length === 0) {
      return NextResponse.json(
        { error: 'Forbidden: you must be an owner or admin to monitor accounts.' },
        { status: 403 }
      );
    }

    const hasAdminRole = adminMemberships.some((m) => ['owner', 'admin'].includes(m.role));
    if (!hasAdminRole) {
      return NextResponse.json(
        { error: 'Forbidden: only owners and platform admins have access to user monitoring.' },
        { status: 403 }
      );
    }

    const allowedBusinessIds = adminMemberships
      .filter((m) => ['owner', 'admin'].includes(m.role))
      .map((m) => m.business_id);

    // Fetch businesses for display names
    const { data: businesses } = await admin
      .from('businesses')
      .select('id, code, name')
      .in('id', allowedBusinessIds);

    const businessMap = new Map<string, { code: string; name: string }>();
    (businesses || []).forEach((b) => businessMap.set(b.id, { code: b.code, name: b.name }));

    // Fetch members within authorized businesses
    let membersQuery = admin
      .from('business_members')
      .select('business_id, user_id, role, is_active, created_at')
      .in('business_id', allowedBusinessIds);

    if (filterBusinessId && filterBusinessId !== 'MASTER' && allowedBusinessIds.includes(filterBusinessId)) {
      membersQuery = membersQuery.eq('business_id', filterBusinessId);
    }

    const { data: members, error: membersError } = await membersQuery;
    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const uniqueUserIds = Array.from(new Set((members || []).map((m) => m.user_id)));

    if (uniqueUserIds.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Fetch profiles for names and phones
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, phone, created_at')
      .in('id', uniqueUserIds);

    const profileMap = new Map<string, { full_name: string | null; phone: string | null; created_at?: string }>();
    (profiles || []).forEach((p) => {
      profileMap.set(p.id, { full_name: p.full_name, phone: p.phone, created_at: p.created_at });
    });

    // Fetch auth user list to get emails and last sign-in
    let authUsersMap = new Map<string, { email?: string; last_sign_in_at?: string }>();
    try {
      const { data: authUsersData } = await admin.auth.admin.listUsers();
      if (authUsersData?.users) {
        authUsersData.users.forEach((u) => {
          authUsersMap.set(u.id, {
            email: u.email,
            last_sign_in_at: u.last_sign_in_at,
          });
        });
      }
    } catch {
      // In case listUsers is restricted, continue with profile data
    }

    // Aggregate transactions decided by these users
    const { data: paymentDecisions } = await admin
      .from('payment_transactions')
      .select('decided_by, amount_minor, status, decided_at')
      .in('decided_by', uniqueUserIds);

    // Aggregate STK pushes requested by these users
    const { data: stkRequests } = await admin
      .from('stk_requests')
      .select('requested_by, amount_minor, status, created_at')
      .in('requested_by', uniqueUserIds);

    // Aggregate audit log events for these users
    const { data: auditEvents } = await admin
      .from('audit_log')
      .select('actor_id, occurred_at')
      .in('actor_id', uniqueUserIds)
      .order('occurred_at', { ascending: false })
      .limit(1000);

    // Compute metrics per user
    const userMetrics = new Map<
      string,
      {
        approvedCount: number;
        approvedVolumeMinor: number;
        rejectedCount: number;
        stkCount: number;
        totalAuditEvents: number;
        lastActiveAt: string | null;
      }
    >();

    uniqueUserIds.forEach((uid) => {
      userMetrics.set(uid, {
        approvedCount: 0,
        approvedVolumeMinor: 0,
        rejectedCount: 0,
        stkCount: 0,
        totalAuditEvents: 0,
        lastActiveAt: null,
      });
    });

    (paymentDecisions || []).forEach((p) => {
      if (!p.decided_by) return;
      const m = userMetrics.get(p.decided_by);
      if (!m) return;

      if (p.status === 'approved') {
        m.approvedCount++;
        m.approvedVolumeMinor += Number(p.amount_minor || 0);
      } else if (p.status === 'rejected') {
        m.rejectedCount++;
      }

      if (p.decided_at) {
        if (!m.lastActiveAt || new Date(p.decided_at) > new Date(m.lastActiveAt)) {
          m.lastActiveAt = p.decided_at;
        }
      }
    });

    (stkRequests || []).forEach((s) => {
      if (!s.requested_by) return;
      const m = userMetrics.get(s.requested_by);
      if (!m) return;
      m.stkCount++;
      if (s.created_at) {
        if (!m.lastActiveAt || new Date(s.created_at) > new Date(m.lastActiveAt)) {
          m.lastActiveAt = s.created_at;
        }
      }
    });

    (auditEvents || []).forEach((a) => {
      if (!a.actor_id) return;
      const m = userMetrics.get(a.actor_id);
      if (!m) return;
      m.totalAuditEvents++;
      if (a.occurred_at) {
        if (!m.lastActiveAt || new Date(a.occurred_at) > new Date(m.lastActiveAt)) {
          m.lastActiveAt = a.occurred_at;
        }
      }
    });

    // Build user responses
    const usersResponse = uniqueUserIds.map((uid) => {
      const prof = profileMap.get(uid);
      const authInfo = authUsersMap.get(uid);
      const metrics = userMetrics.get(uid) || {
        approvedCount: 0,
        approvedVolumeMinor: 0,
        rejectedCount: 0,
        stkCount: 0,
        totalAuditEvents: 0,
        lastActiveAt: null,
      };

      const userMemberships = (members || [])
        .filter((m) => m.user_id === uid)
        .map((m) => {
          const biz = businessMap.get(m.business_id);
          return {
            businessId: m.business_id,
            businessCode: biz?.code || 'UNKNOWN',
            businessName: biz?.name || 'Unknown Business',
            role: m.role,
            isActive: m.is_active,
            joinedAt: m.created_at,
          };
        });

      // Best guess for display name: profile full_name -> email prefix -> short user id
      const displayName =
        prof?.full_name ||
        (authInfo?.email ? authInfo.email.split('@')[0] : `User ${uid.slice(0, 8)}`);

      const effectiveLastActive =
        metrics.lastActiveAt ||
        authInfo?.last_sign_in_at ||
        prof?.created_at ||
        userMemberships[0]?.joinedAt ||
        null;

      return {
        userId: uid,
        displayName,
        email: authInfo?.email || null,
        phone: prof?.phone || null,
        isCurrentUser: uid === user.id,
        memberships: userMemberships,
        metrics: {
          ...metrics,
          lastActiveAt: effectiveLastActive,
        },
      };
    });

    // Sort by volume descending, then by approval count
    usersResponse.sort(
      (a, b) =>
        b.metrics.approvedVolumeMinor - a.metrics.approvedVolumeMinor ||
        b.metrics.approvedCount - a.metrics.approvedCount
    );

    return NextResponse.json({
      success: true,
      users: usersResponse,
      requestingUserId: user.id,
    });
  } catch (err: any) {
    console.error('Admin users monitoring API error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
