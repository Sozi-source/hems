import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface TeamMemberResponse {
  business_id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  email: string | null;
  full_name: string | null;
}

// GET /api/team?businessId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Check caller's role for this business
    let userRoleQuery = admin
      .from('business_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (businessId) {
      userRoleQuery = userRoleQuery.eq('business_id', businessId);
    }

    const { data: callerRoles } = await userRoleQuery;
    const isOwnerOrAdmin = (callerRoles || []).some((r) => ['owner', 'admin'].includes(r.role));
    const callerRole = callerRoles?.[0]?.role || 'viewer';

    // Query members
    let query = admin
      .from('business_members')
      .select('business_id, user_id, role, is_active, created_at')
      .order('created_at', { ascending: true });

    if (businessId) {
      query = query.eq('business_id', businessId);
    }

    const { data: members, error: memErr } = await query;
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    // Fetch user profiles & auth users
    const userIds = Array.from(new Set((members || []).map((m) => m.user_id)));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', userIds);

    const { data: authUsersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const authUsers = authUsersData?.users || [];

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const authUserMap = new Map(authUsers.map((u) => [u.id, u]));

    const result: TeamMemberResponse[] = (members || []).map((m) => {
      const prof = profileMap.get(m.user_id);
      const authU = authUserMap.get(m.user_id);
      return {
        business_id: m.business_id,
        user_id: m.user_id,
        role: m.role,
        is_active: m.is_active,
        created_at: m.created_at,
        email: authU?.email || null,
        full_name: prof?.full_name || authU?.user_metadata?.full_name || authU?.email || 'Employee',
      };
    });

    return NextResponse.json({
      members: result,
      callerRole,
      isOwner: callerRole === 'owner',
      canManageRoles: isOwnerOrAdmin,
    });
  } catch (error) {
    console.error('Failed to get team members:', error);
    return NextResponse.json({ error: 'Failed to retrieve team members' }, { status: 500 });
  }
}

// POST /api/team — Add/Invite Employee and Allocate Rights
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { businessId, email, fullName, role, password } = body;

    if (!businessId || !email || !role) {
      return NextResponse.json({ error: 'businessId, email, and role are required.' }, { status: 400 });
    }

    const validRoles = ['owner', 'admin', 'accountant', 'cashier', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify current user is an owner of this business
    const { data: callerMember } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .maybeSingle();

    if (callerMember?.role !== 'owner') {
      return NextResponse.json({ error: 'Only business owners can allocate roles and invite employees.' }, { status: 403 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (fullName || cleanEmail.split('@')[0]).trim();

    // Check if user already exists in auth.users
    const { data: existingUsersData } = await admin.auth.admin.listUsers();
    let targetUser = (existingUsersData?.users || []).find((u) => u.email?.toLowerCase() === cleanEmail);

    if (!targetUser) {
      // Create new user with provided password or default secure password
      const userPassword = password && password.length >= 8 ? password : `Hems#${Math.random().toString(36).slice(2, 8)}!2026`;
      const { data: createdAuth, error: createAuthErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: userPassword,
        email_confirm: true,
        user_metadata: { full_name: cleanName },
      });

      if (createAuthErr || !createdAuth.user) {
        return NextResponse.json({ error: `Could not create employee user: ${createAuthErr?.message}` }, { status: 400 });
      }
      targetUser = createdAuth.user;

      // Upsert profile
      await admin.from('profiles').upsert({
        id: targetUser.id,
        full_name: cleanName,
      });
    }

    // Allocate membership & role in business_members
    const { data: member, error: memberErr } = await admin
      .from('business_members')
      .upsert(
        {
          business_id: businessId,
          user_id: targetUser.id,
          role,
          is_active: true,
        },
        { onConflict: 'business_id,user_id' }
      )
      .select('*')
      .single();

    if (memberErr) {
      return NextResponse.json({ error: `Could not allocate membership: ${memberErr.message}` }, { status: 400 });
    }

    // Explicit audit log entry
    await admin.from('audit_log').insert({
      business_id: businessId,
      actor_id: currentUser.id,
      actor_label: currentUser.email || 'Owner',
      action: 'INSERT',
      table_name: 'business_members',
      record_id: `${businessId}:${targetUser.id}`,
      new_data: {
        user_id: targetUser.id,
        email: cleanEmail,
        full_name: cleanName,
        allocated_role: role,
        allocated_by: currentUser.id,
      },
    });

    return NextResponse.json({
      success: true,
      member: {
        ...member,
        email: cleanEmail,
        full_name: cleanName,
      },
    });
  } catch (error) {
    console.error('Failed to add employee:', error);
    return NextResponse.json({ error: 'Failed to allocate employee rights' }, { status: 500 });
  }
}

// PATCH /api/team — Update Employee Role or Status
export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { businessId, userId, role, isActive } = body;

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'businessId and userId are required.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify current user is an owner
    const { data: callerMember } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .maybeSingle();

    if (callerMember?.role !== 'owner') {
      return NextResponse.json({ error: 'Only business owners can modify permissions.' }, { status: 403 });
    }

    // Protect sole owner lockout
    if (userId === currentUser.id && (role !== 'owner' || isActive === false)) {
      const { data: allOwners } = await admin
        .from('business_members')
        .select('user_id')
        .eq('business_id', businessId)
        .eq('role', 'owner')
        .eq('is_active', true);

      if ((allOwners || []).length <= 1) {
        return NextResponse.json({ error: 'Cannot remove or suspend the sole active owner of this business.' }, { status: 400 });
      }
    }

    const updatePayload: Record<string, any> = {};
    if (role) {
      const validRoles = ['owner', 'admin', 'accountant', 'cashier', 'viewer'];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: 'Invalid role specified.' }, { status: 400 });
      }
      updatePayload.role = role;
    }
    if (typeof isActive === 'boolean') {
      updatePayload.is_active = isActive;
    }

    const { data: oldMember } = await admin
      .from('business_members')
      .select('*')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .single();

    const { data: updatedMember, error: updateErr } = await admin
      .from('business_members')
      .update(updatePayload)
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // Explicit audit log entry
    await admin.from('audit_log').insert({
      business_id: businessId,
      actor_id: currentUser.id,
      actor_label: currentUser.email || 'Owner',
      action: 'UPDATE',
      table_name: 'business_members',
      record_id: `${businessId}:${userId}`,
      old_data: oldMember,
      new_data: updatedMember,
    });

    return NextResponse.json({ success: true, member: updatedMember });
  } catch (error) {
    console.error('Failed to update employee permissions:', error);
    return NextResponse.json({ error: 'Failed to update employee permissions' }, { status: 500 });
  }
}

// DELETE /api/team — Remove Employee from Business
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get('businessId');
    const userId = searchParams.get('userId');

    if (!businessId || !userId) {
      return NextResponse.json({ error: 'businessId and userId are required.' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify caller is owner
    const { data: callerMember } = await admin
      .from('business_members')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', currentUser.id)
      .eq('is_active', true)
      .maybeSingle();

    if (callerMember?.role !== 'owner') {
      return NextResponse.json({ error: 'Only owners can remove team members.' }, { status: 403 });
    }

    if (userId === currentUser.id) {
      return NextResponse.json({ error: 'You cannot remove yourself from the business.' }, { status: 400 });
    }

    const { data: oldMember } = await admin
      .from('business_members')
      .select('*')
      .eq('business_id', businessId)
      .eq('user_id', userId)
      .maybeSingle();

    const { error: delErr } = await admin
      .from('business_members')
      .delete()
      .eq('business_id', businessId)
      .eq('user_id', userId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // Explicit audit log entry
    await admin.from('audit_log').insert({
      business_id: businessId,
      actor_id: currentUser.id,
      actor_label: currentUser.email || 'Owner',
      action: 'DELETE',
      table_name: 'business_members',
      record_id: `${businessId}:${userId}`,
      old_data: oldMember,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove team member:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}
