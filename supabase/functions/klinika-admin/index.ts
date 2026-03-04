import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create admin client - needed for some ops
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });



    // Create a Supabase client for the user's session
    let supabaseClient = null;

    const body = await req.json();
    const { operation, ...params } = body;

    console.log(`Klinika Admin operation: ${operation}`);

    // DEBUG: Inspect invite/user state without auth (protected by secret)
    if (operation === 'debug-inspect-invite') {
      const { email, secret } = params;
      if (secret !== 'super-secret-fix-key-123') {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) return new Response(JSON.stringify({ error: listError.message }), { status: 500 });

      const targetUser = users.find(u => u.email?.toLowerCase() === email?.toLowerCase());

      let userData = null;
      if (targetUser) {
        const { data: profile } = await supabaseAdmin.from("profiles").select("*, current_telephely_id").eq("user_id", targetUser.id).single();
        const { data: memberships } = await supabaseAdmin.from("telephely_memberships").select("*").eq("user_id", targetUser.id);
        const { data: roles } = await supabaseAdmin.from("user_roles").select("*").eq("user_id", targetUser.id);
        userData = { user: targetUser, profile, memberships, roles };
      }

      let invitations;
      if (email) {
        const { data } = await supabaseAdmin
          .from("invitations")
          .select("*")
          .eq("invited_email", email.toLowerCase());
        invitations = data;
      } else {
        const { data } = await supabaseAdmin
          .from("invitations")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(5);
        invitations = data;
      }

      return new Response(JSON.stringify({
        userData,
        invitations
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }



    // DEBUG: Update user role without auth (protected by secret)
    if (operation === 'debug-update-user') {
      const { userId, role, secret, telephelyId } = params;
      if (secret !== 'super-secret-fix-key-123') {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      console.log(`DEBUG: Updating user ${userId} to role ${role} in telephely ${telephelyId}`);

      // Explicitly try the upsert and return the result
      const { data: upsertData, error: upsertError } = await supabaseAdmin
        .from("telephely_memberships")
        .upsert({
          user_id: userId,
          telephely_id: telephelyId,
          role: role
        }, { onConflict: 'user_id, telephely_id' })
        .select();

      return new Response(JSON.stringify({
        success: !upsertError,
        data: upsertData,
        error: upsertError
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (operation === 'debug-simulate-get-users') {
      const { secret, telephelyId } = params;
      if (secret !== 'super-secret-fix-key-123') {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }

      console.log(`DEBUG: Simulating get-users for telephely ${telephelyId}`);

      // Logic copied from get-users
      const { data: memberships, error: membersError } = await supabaseAdmin
        .from("telephely_memberships")
        .select("user_id, role")
        .eq("telephely_id", telephelyId);

      if (membersError) {
        return new Response(JSON.stringify({ error: membersError }), { status: 500 });
      }

      const userIds = memberships?.map(m => m.user_id) || [];
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").in("user_id", userIds);
      const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();

      const users = memberships?.map(member => {
        const profile = profiles?.find(p => p.user_id === member.user_id) || {};
        const authUser = authUsers?.find(u => u.id === member.user_id);

        return {
          id: member.user_id,
          email: authUser?.email || "Unknown",
          full_name: profile.full_name || authUser?.user_metadata?.full_name || "Unknown",
          role: member.role,
        };
      }) || [];

      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Enforce Authentication for normal operations
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = user;
    console.log(`User authenticated: ${caller.id}`);

    console.log(`Klinika Admin operation: ${operation} by user ${caller.id}`);

    // Operations that any authenticated user can access
    const userAccessOperations = ['get-pending-invitations', 'respond-invitation'];

    if (userAccessOperations.includes(operation)) {
      // These operations don't require admin role, handle them separately
      if (operation === 'get-pending-invitations') {
        const { data: invitations, error } = await supabaseAdmin
          .from("invitations")
          .select(`
            id,
            created_at,
            company_id,
            telephely_id,
            invited_by_user_id,
            companies(name),
            telephely(name)
          `)
          .eq("invited_user_id", caller.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching invitations:", error);
          return new Response(JSON.stringify({ error: "Failed to fetch invitations" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get inviter names
        const inviterIds = invitations?.map(i => i.invited_by_user_id) || [];
        const { data: inviterProfiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", inviterIds);

        const formattedInvitations = invitations?.map(inv => {
          const companyData = inv.companies as unknown as { name: string } | null;
          const telephelyData = inv.telephely as unknown as { name: string } | null;
          return {
            id: inv.id,
            created_at: inv.created_at,
            company_name: companyData?.name || 'Unknown',
            telephely_name: telephelyData?.name || 'Unknown',
            invited_by_name: inviterProfiles?.find(p => p.user_id === inv.invited_by_user_id)?.full_name || 'Unknown',
          };
        }) || [];

        return new Response(JSON.stringify({ invitations: formattedInvitations }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (operation === 'respond-invitation') {
        const { invitationId, response } = params;
        if (!invitationId || !response) {
          return new Response(JSON.stringify({ error: "invitationId and response are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response !== 'accepted' && response !== 'declined') {
          return new Response(JSON.stringify({ error: "Response must be 'accepted' or 'declined'" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get invitation details
        const { data: invitation, error: invitationError } = await supabaseAdmin
          .from("invitations")
          .select("*, companies(name), telephely(name)")
          .eq("id", invitationId)
          .eq("invited_user_id", caller.id)
          .eq("status", "pending")
          .single();

        if (invitationError || !invitation) {
          return new Response(JSON.stringify({ error: "Invitation not found or already responded" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update invitation status
        const { error: updateInvError } = await supabaseAdmin
          .from("invitations")
          .update({ status: response, responded_at: new Date().toISOString() })
          .eq("id", invitationId);

        if (updateInvError) {
          console.error("Error updating invitation:", updateInvError);
          return new Response(JSON.stringify({ error: "Failed to update invitation" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response === 'accepted') {
          // Add user to company
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update({
              company_id: invitation.company_id,
              telephely_id: invitation.telephely_id,
            })
            .eq("user_id", caller.id);

          if (profileError) {
            console.error("Error adding user to company:", profileError);
            return new Response(JSON.stringify({ error: "Failed to join company" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Auto-assign an available license
          try {
            const { data: availableLicense } = await supabaseAdmin
              .from("licenses")
              .select("id")
              .eq("company_id", invitation.company_id)
              .eq("status", "available")
              .is("assigned_user_id", null)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (availableLicense) {
              await supabaseAdmin
                .from("licenses")
                .update({ assigned_user_id: caller.id, status: "assigned" })
                .eq("id", availableLicense.id);
              console.log(`Auto-assigned license ${availableLicense.id} to accepted user ${caller.id}`);
            }
          } catch (licErr) {
            console.error("Error auto-assigning license on invitation accept:", licErr);
          }

          console.log(`User ${caller.id} accepted invitation to company ${invitation.company_id}`);
        } else {
          console.log(`User ${caller.id} declined invitation to company ${invitation.company_id}`);
        }

        return new Response(JSON.stringify({ success: true, response }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (operation === 'get-user-by-email') {
      const { email } = params;
      if (!email) {
        return new Response(JSON.stringify({ error: "email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // We need to list users as there's no direct search by email in auth.admin that is consistently available across versions
      // But for small sets it's fine.
      const { data: { users: authUsers }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) {
        return new Response(JSON.stringify({ error: "Failed to search users" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const foundUser = authUsers.find(u => u.email === email);
      if (!foundUser) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ user: { id: foundUser.id, email: foundUser.email } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For all other operations, check if caller is klinika_admin or admin
    let isKlinikaAdmin = false;
    let isAdmin = false;

    // Check for klinika_admin role in memberships (since it's not in user_roles global table usually)
    const { data: membership } = await supabaseClient
      .from("telephely_memberships")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "klinika_admin")
      .maybeSingle();

    isKlinikaAdmin = !!membership;

    // Check for global admin role
    const { data: adm } = await supabaseClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    isAdmin = adm;

    if (!isKlinikaAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Klinika Admin or Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Get caller's company and telephely
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, telephely_id, current_telephely_id, company_name")
      .eq("user_id", caller.id)
      .single();

    // Resolve telephely: prefer current_telephely_id > telephely_id > membership
    let activeTelephelyId = callerProfile?.current_telephely_id || callerProfile?.telephely_id;
    let resolvedCompanyId = callerProfile?.company_id;
    let resolvedCompanyName = callerProfile?.company_name;

    // Fallback: if profile has no telephely, check telephely_memberships
    if (!activeTelephelyId) {
      const { data: membership } = await supabaseAdmin
        .from("telephely_memberships")
        .select("telephely_id")
        .eq("user_id", caller.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        activeTelephelyId = membership.telephely_id;
      }
    }

    // Fallback: if no company resolved, get it from the telephely
    if (!resolvedCompanyId && activeTelephelyId) {
      const { data: telephelyData } = await supabaseAdmin
        .from("telephely")
        .select("company_id")
        .eq("id", activeTelephelyId)
        .single();

      if (telephelyData?.company_id) {
        resolvedCompanyId = telephelyData.company_id;
        const { data: companyData } = await supabaseAdmin
          .from("companies")
          .select("name")
          .eq("id", telephelyData.company_id)
          .single();
        resolvedCompanyName = companyData?.name || null;
      }
    }

    const hasCompanyAndTelephely = resolvedCompanyId && activeTelephelyId;

    if (!isAdmin && !hasCompanyAndTelephely) {
      console.log(`User ${caller.id} is klinika_admin but has no company/telephely assigned`);
      return new Response(JSON.stringify({ error: "Klinika Admin must have company and telephely assigned" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`User ${caller.id} accessing klinika-admin: isAdmin=${isAdmin}, isKlinikaAdmin=${isKlinikaAdmin}, hasCompanyAndTelephely=${hasCompanyAndTelephely}, activeTelephely=${activeTelephelyId}`);

    // If admin without company/telephely, return empty data for certain operations
    if (!hasCompanyAndTelephely) {
      if (operation === 'get-users') {
        return new Response(JSON.stringify({ users: [], companyName: null, telephelyName: null, message: "No company/telephely assigned" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (operation === 'get-sent-invitations') {
        return new Response(JSON.stringify({ invitations: [], message: "No company/telephely assigned" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Allow debug-sync ONLY if admin, but it likely needs telephelyId from params
      if (operation === 'debug-sync' && isAdmin) {
        // Pass through
      } else {
        return new Response(JSON.stringify({ error: "Company and telephely required for this operation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // At this point, callerProfile is guaranteed to have company_id and telephely_id (unless passed through above)
    const companyId = resolvedCompanyId;
    const telephelyId = activeTelephelyId;
    const companyName = resolvedCompanyName;

    switch (operation) {
      case "debug-user": {
        if (!isAdmin) return new Response("Unauthorized", { status: 403 });
        const { email } = params;
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const targetUser = users?.find(u => u.email === email);

        if (!targetUser) return new Response(JSON.stringify({ error: "User not found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

        const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("user_id", targetUser.id).single();
        const { data: memberships } = await supabaseAdmin.from("telephely_memberships").select("*").eq("user_id", targetUser.id);
        const { data: roles } = await supabaseAdmin.from("user_roles").select("*").eq("user_id", targetUser.id);

        return new Response(JSON.stringify({
          user: targetUser,
          profile,
          memberships,
          roles
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      case "get-users": {
        console.log(`get-users: Fetching users for company ${companyId}, telephely ${telephelyId}`);

        // Get all members of the telephely - simpler query first
        const { data: memberships, error: membersError } = await supabaseAdmin
          .from("telephely_memberships")
          .select("user_id, role")
          .eq("telephely_id", telephelyId);

        if (membersError) {
          console.error("Error fetching memberships:", membersError);
          return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // SELF-REPAIR: Check if caller (Admin) is in the list. If not, add them.
        const callerIsMember = memberships?.some(m => m.user_id === caller.id);
        if (!callerIsMember) {
          console.log(`Self-repair: Caller ${caller.id} is missing membership for telephely ${telephelyId}. Fixing...`);

          const newMembership = {
            user_id: caller.id,
            telephely_id: telephelyId,
            role: 'klinika_admin'
          };

          const { error: insertError } = await supabaseAdmin
            .from("telephely_memberships")
            .insert(newMembership);

          if (insertError) {
            console.error("Self-repair failed:", insertError);
          } else {
            // Add to local list so they show up immediately
            memberships?.push(newMembership as any);
          }
        }

        console.log(`get-users: Found ${memberships?.length || 0} members for telephely ${telephelyId}`);

        // BACKFILL/SYNC: Find users who have this telephely in their profile but NO membership
        // This handles legacy users or users assigned via old methods
        console.log(`Sync: Checking for legacy profiles with telephely_id=${telephelyId} or current_telephely_id=${telephelyId}`);
        const { data: legacyProfiles, error: legacyError } = await supabaseAdmin
          .from("profiles")
          .select("user_id, telephely_id, current_telephely_id")
          .or(`telephely_id.eq.${telephelyId},current_telephely_id.eq.${telephelyId}`);

        if (legacyError) {
          console.error("Sync: Error fetching legacy profiles:", legacyError);
        } else if (legacyProfiles && legacyProfiles.length > 0) {
          console.log(`Sync: Found ${legacyProfiles.length} potential legacy profiles.`);
          const existingMemberIds = new Set(memberships?.map(m => m.user_id) || []);
          const missingUsers = legacyProfiles.filter(p => !existingMemberIds.has(p.user_id));

          if (missingUsers.length > 0) {
            console.log(`Sync: Found ${missingUsers.length} users with profile.telephely_id=${telephelyId} but no membership. Fix...`);

            const newMemberships = missingUsers.map(p => ({
              user_id: p.user_id,
              telephely_id: telephelyId,
              role: 'user' // Default to user, can be upgraded later if needed
            }));

            const { error: insertError } = await supabaseAdmin
              .from("telephely_memberships")
              .insert(newMemberships);

            if (insertError) {
              console.error("Sync failed:", insertError);
            } else {
              console.log(`Sync: Successfully inserted ${newMemberships.length} memberships.`);
              // Add them to the local list so they appear immediately
              newMemberships.forEach(m => {
                if (memberships) memberships.push(m as any);
              });
            }
          } else {
            console.log("Sync: All legacy profiles already have memberships. No action needed.");
          }
        } else {
          console.log("Sync: No legacy profiles found matching this telephely.");
        }

        // Get auth users for email info
        const userIds = memberships?.map(m => m.user_id) || [];

        // Fetch profiles separately
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .in("user_id", userIds);

        // Fetch auth users
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();

        const users = memberships?.map(member => {
          const profile = profiles?.find(p => p.user_id === member.user_id) || {};
          const authUser = authUsers?.find(u => u.id === member.user_id);

          return {
            id: member.user_id,
            email: authUser?.email || "Unknown",
            full_name: profile.full_name || authUser?.user_metadata?.full_name || "Unknown",
            role: member.role, // Use role from membership!
            subscription_status: profile.subscription_status || "inactive",
            subscription_plan: profile.subscription_plan || "free",
            subscription_end_date: profile.subscription_end_date,
            avatar_url: profile.avatar_url,
          };
        }) || [];

        console.log(`get-users: Returning ${users.length} users for ${companyName}`);

        return new Response(JSON.stringify({ users, companyName: companyName }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "get-available-users": {
        // Get users that can be invited (not in any company/telephely or in a different one)
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const confirmedUsers = authUsers?.filter(u => u.email_confirmed_at) || [];

        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name, company_id, telephely_id");

        // Get user roles
        const allUserIds = confirmedUsers.map(u => u.id);
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", allUserIds);

        // Get pending invitations (any company/telephely)
        // This prevents duplicate invites when there is a global unique constraint on pending invitations.
        const { data: pendingInvitations } = await supabaseAdmin
          .from("invitations")
          .select("invited_user_id")
          .eq("status", "pending");

        const pendingUserIds = pendingInvitations?.map(i => i.invited_user_id) || [];

        const availableUsers = confirmedUsers
          .filter(authUser => {
            const profile = profiles?.find(p => p.user_id === authUser.id);
            // User is available if they have no company/telephely OR different company/telephely
            // But exclude admins and klinika_admins
            const userRole = roles?.find(r => r.user_id === authUser.id);
            if (userRole?.role === 'admin' || userRole?.role === 'klinika_admin') return false;

            // Exclude users with pending invitations
            if (pendingUserIds.includes(authUser.id)) return false;

            if (!profile) return true;
            return !profile.company_id || !profile.telephely_id ||
              profile.company_id !== companyId ||
              profile.telephely_id !== telephelyId;
          })
          .map(authUser => {
            const profile = profiles?.find(p => p.user_id === authUser.id);
            return {
              id: authUser.id,
              email: authUser.email,
              full_name: profile?.full_name || null,
              has_company: !!profile?.company_id,
              is_local_user: authUser.email?.endsWith('@localuser.com') || false,
            };
          });

        return new Response(JSON.stringify({ users: availableUsers }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "invite-user": {
        const { userId, role } = params;
        const inviteRole = role || 'user'; // Default to user if not specified

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate role
        if (!['user', 'klinika_admin', 'admin'].includes(inviteRole)) {
          return new Response(JSON.stringify({ error: "Invalid role. Must be 'user' or 'klinika_admin'" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if user is trying to invite as admin but is not admin themselves
        // Klinika Admin can invite other Klinika Admins? Let's say yes for now.
        // We already checked basic role access properly at start of function.

        // Get user email to check if local user
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const targetUser = authUsers?.find(u => u.id === userId);
        const isLocalUser = targetUser?.email?.endsWith('@localuser.com') || false;

        if (isLocalUser) {
          // Local users get added directly

          // 1. Update profile for legacy compatibility
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              company_id: companyId,
              telephely_id: telephelyId,
            })
            .eq("user_id", userId);

          if (updateError) {
            console.error("Error adding local user (profile update):", updateError);
            return new Response(JSON.stringify({ error: "Failed to add user" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // 2. Create membership
          const { error: membershipError } = await supabaseAdmin
            .from("telephely_memberships")
            .insert({
              user_id: userId,
              telephely_id: telephelyId,
              role: "user"
            });

          if (membershipError) {
            console.error("Error adding local user (membership):", membershipError);
            // If duplicate, it's fine, they are already member?
            if (membershipError.code !== '23505') {
              return new Response(JSON.stringify({ error: "Failed to add user membership" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }

          // Auto-assign an available license
          try {
            const { data: availableLicense } = await supabaseAdmin
              .from("licenses")
              .select("id")
              .eq("company_id", companyId)
              .eq("status", "available")
              .is("assigned_user_id", null)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (availableLicense) {
              await supabaseAdmin
                .from("licenses")
                .update({ assigned_user_id: userId, status: "assigned" })
                .eq("id", availableLicense.id);
              console.log(`Auto-assigned license ${availableLicense.id} to local user ${userId}`);
            }
          } catch (licErr) {
            console.error("Error auto-assigning license to local user:", licErr);
          }

          console.log(`Local user ${userId} added directly to company ${companyId} and telephely ${telephelyId}`);

          return new Response(JSON.stringify({ success: true, type: 'direct' }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // For email users, create (or re-open) an invitation
        const nowIso = new Date().toISOString();
        const { error: inviteError } = await supabaseAdmin
          .from("invitations")
          .insert({
            invited_user_id: userId,
            invited_by_user_id: caller.id,
            company_id: companyId,
            telephely_id: telephelyId,
            role: inviteRole, // Insert role
            status: 'pending',
            responded_at: null,
            created_at: nowIso,
          });

        if (inviteError) {
          if (inviteError.code === '23505') {
            // There is an existing invitation row (often due to a unique constraint not scoped by status).
            // If it's already pending -> block. Otherwise, re-open it as pending.
            const { data: existing, error: existingError } = await supabaseAdmin
              .from('invitations')
              .select('id, status')
              .eq('invited_user_id', userId)
              .eq('company_id', companyId)
              .eq('telephely_id', telephelyId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (existingError) {
              console.error('Error loading existing invitation:', existingError);
              return new Response(JSON.stringify({ error: 'Failed to create invitation' }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            if (existing?.status === 'pending') {
              return new Response(
                JSON.stringify({ success: false, error: 'Már van függőben lévő meghívás ennek a felhasználónak' }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }

            if (existing?.id) {
              const { error: reopenError } = await supabaseAdmin
                .from('invitations')
                .update({
                  status: 'pending',
                  responded_at: null,
                  invited_by_user_id: caller.id,
                  created_at: nowIso,
                })
                .eq('id', existing.id);

              if (reopenError) {
                console.error('Error reopening invitation:', reopenError);
                return new Response(JSON.stringify({ error: 'Failed to create invitation' }), {
                  status: 500,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              console.log(`Invitation reopened for user ${userId} to company ${companyId} by ${caller.id}`);
              return new Response(JSON.stringify({ success: true, type: 'invitation', reopened: true }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }

            // Fallback: unknown conflict
            return new Response(JSON.stringify({ error: 'Failed to create invitation' }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.error("Error creating invitation:", inviteError);
          return new Response(JSON.stringify({ error: "Failed to create invitation" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Invitation created for user ${userId} to company ${companyId} by ${caller.id}`);

        return new Response(JSON.stringify({ success: true, type: 'invitation' }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }


      case "get-sent-invitations": {
        // Get invitations sent by the klinika admin
        const { data: invitations, error } = await supabaseAdmin
          .from("invitations")
          .select(`
            id,
            status,
            role,
            created_at,
            responded_at,
            invited_email,
            invited_user_id
          `)
          .eq("invited_by_user_id", caller.id)
          .eq("company_id", companyId)
          .eq("telephely_id", telephelyId)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Error fetching sent invitations:", error);
          return new Response(JSON.stringify({ error: "Failed to fetch invitations" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get invitee details
        const inviteeIds = invitations?.map(i => i.invited_user_id) || [];
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", inviteeIds);

        const formattedInvitations = invitations?.map(inv => {
          const authUser = authUsers?.find(u => u.id === inv.invited_user_id);
          const profile = profiles?.find(p => p.user_id === inv.invited_user_id);
          return {
            id: inv.id,
            email: inv.invited_email,
            status: inv.status,
            role: inv.role,
            created_at: inv.created_at,
            responded_at: inv.responded_at,
            full_name: profile?.full_name || null,
          };
        }) || [];

        return new Response(JSON.stringify({ invitations: formattedInvitations }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "cancel-invitation": {
        const { invitationId } = params;
        if (!invitationId) {
          return new Response(JSON.stringify({ error: "invitationId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error, count } = await supabaseAdmin
          .from("invitations")
          .delete({ count: 'exact' })
          .eq("id", invitationId)
          .eq("company_id", companyId)
          .eq("telephely_id", telephelyId)
          .eq("status", "pending");

        if (error) {
          console.error("Error canceling invitation:", error);
          return new Response(JSON.stringify({ error: "Failed to cancel invitation" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (count === 0) {
          return new Response(JSON.stringify({ error: "Meghívó nem található vagy már nem függő" }), {
            status: 404, // Use 404 or 400 to indicate failure to find/delete
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "remove-user": {
        const { userId } = params;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Don't allow removing yourself
        if (userId === caller.id) {
          return new Response(JSON.stringify({ error: "Cannot remove yourself" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Remove company and telephely from user's profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            company_id: null,
            telephely_id: null,
          })
          .eq("user_id", userId)
          .eq("company_id", companyId)
          .eq("telephely_id", telephelyId);

        if (updateError) {
          console.error("Error removing user:", updateError);
          return new Response(JSON.stringify({ error: "Failed to remove user" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }







      case "create-user": {
        const { email, password, fullName, role } = params;
        console.log(`create-user: Creating user ${email}, role=${role}`);

        // Restrict direct user creation to global admins
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Only global admins can create users directly. Please use invitation." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const userRole = role || 'user'; // Default to user if not specified

        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password are required" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const isLocalUser = email.endsWith("@localuser.com");

        // Create the user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName || email.split("@")[0],
            is_username_login: isLocalUser,
            original_username: isLocalUser ? email.split("@")[0] : undefined,
            admin_created: true,
          },
        });

        if (createError) {
          console.error("Error creating user:", createError);
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create or update profile with the klinika admin's company and telephely
        // Using upsert because the handle_email_confirmation trigger may have already created the profile
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            user_id: newUser.user.id,
            full_name: fullName || email.split("@")[0],
            company_id: companyId,
            telephely_id: telephelyId,
            company_name: companyName,
          }, {
            onConflict: 'user_id',
          });

        if (profileError) {
          console.error("Error creating/updating profile:", profileError);
          // Return error so UI knows profile creation failed
          return new Response(JSON.stringify({
            success: true,
            warning: "User created but profile assignment failed",
            user: { id: newUser.user.id, email: newUser.user.email }
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Create membership
        const { error: membershipError } = await supabaseAdmin
          .from("telephely_memberships")
          .upsert({
            user_id: newUser.user.id,
            telephely_id: telephelyId,
            role: userRole
          }, { onConflict: 'user_id, telephely_id' });

        if (membershipError) {
          console.error("Error creating membership:", membershipError);
        }

        // Also add legacy user_roles entry for 'user' as fallback/compat
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUser.user.id, role: userRole });

        if (roleError) {
          console.error("Error creating compat role:", roleError);
        }

        // Create user folder in storage
        try {
          // Get telephely name for folder path
          const { data: telephelyData } = await supabaseAdmin
            .from("telephely")
            .select("name")
            .eq("id", telephelyId)
            .single();

          if (telephelyData && companyName) {
            // Sanitize path by converting Hungarian/special characters to ASCII equivalents and keeping spaces
            const charMap: Record<string, string> = {
              'á': 'a', 'Á': 'A', 'é': 'e', 'É': 'E', 'í': 'i', 'Í': 'I',
              'ó': 'o', 'Ó': 'O', 'ö': 'o', 'Ö': 'O', 'ő': 'o', 'Ő': 'O',
              'ú': 'u', 'Ú': 'U', 'ü': 'u', 'Ü': 'U', 'ű': 'u', 'Ű': 'U',
            };
            const sanitize = (str: string) => str.split('').map(char => charMap[char] || char).join('').replace(/\s+/g, ' ').trim();

            const sanitizedCompany = sanitize(companyName);
            const sanitizedTelephely = sanitize(telephelyData.name);
            const userName = fullName || email.split("@")[0];
            const sanitizedUser = sanitize(userName);

            const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/${sanitizedUser}`;

            // Create folder by uploading a placeholder file
            const { error: storageError } = await supabaseAdmin.storage
              .from("client-files")
              .upload(`${folderPath}/.folder_placeholder`, new Uint8Array(0), {
                contentType: "application/octet-stream",
                upsert: true,
              });

            if (storageError) {
              console.error("Error creating user folder:", storageError);
            } else {
              console.log(`Created user folder: ${folderPath}`);
            }
          }
        } catch (folderError) {
          console.error("Error creating user folder:", folderError);
          // Don't fail the user creation if folder creation fails
        }

        // Auto-assign an available license to the new user
        try {
          const { data: availableLicense } = await supabaseAdmin
            .from("licenses")
            .select("id")
            .eq("company_id", companyId)
            .eq("status", "available")
            .is("assigned_user_id", null)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (availableLicense) {
            await supabaseAdmin
              .from("licenses")
              .update({ assigned_user_id: newUser.user.id, status: "assigned" })
              .eq("id", availableLicense.id);
            console.log(`Auto-assigned license ${availableLicense.id} to new user ${newUser.user.id}`);
          } else {
            console.log(`No available license to auto-assign for new user ${newUser.user.id}`);
          }
        } catch (licenseError) {
          console.error("Error auto-assigning license:", licenseError);
        }

        console.log(`User ${newUser.user.id} created by klinika_admin ${caller.id} with company ${companyId}`);

        return new Response(JSON.stringify({
          success: true,
          user: {
            id: newUser.user.id,
            email: newUser.user.email,
          },
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update-user": {
        const { userId, fullName, role } = params;

        console.log(`[update-user] START: User=${userId}, Role=${role}, ContextTelephely=${telephelyId}`);

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!telephelyId) {
          console.error("[update-user] ERROR: No telephely context found for caller.");
          return new Response(JSON.stringify({ error: "Context error: No telephely selected" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Don't allow updating yourself via this operation
        if (userId === caller.id) {
          return new Response(JSON.stringify({ error: "Cannot update yourself via this operation" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify the user is in the same telephely via MEMBERSHIPS (more reliable than profile)
        const { data: targetMembership, error: membershipCheckError } = await supabaseAdmin
          .from("telephely_memberships")
          .select("id, role")
          .eq("user_id", userId)
          .eq("telephely_id", telephelyId)
          .maybeSingle();

        if (membershipCheckError) {
          console.error("[update-user] Membership check error:", membershipCheckError);
        }

        if (!isAdmin && !targetMembership) {
          console.log("[update-user] No membership found, checking profile fallback...");
          // Fallback: Check profile if membership missing (legacy mismatch?)
          const { data: targetProfile } = await supabaseAdmin
            .from("profiles")
            .select("company_id, telephely_id")
            .eq("user_id", userId)
            .single();

          if (!targetProfile || targetProfile.company_id !== companyId || targetProfile.telephely_id !== telephelyId) {
            console.error("[update-user] Auth Failed: Profile mismatch or missing.", targetProfile);
            return new Response(JSON.stringify({ error: "You can only update users within your organization" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // SELF-REPAIR: If authorization passed, ensure profile is synced to this telephely
        // This fixes the "profile has nulls" issue
        await supabaseAdmin
          .from("profiles")
          .update({
            company_id: companyId,
            telephely_id: telephelyId,
            current_telephely_id: telephelyId
          })
          .eq("user_id", userId)
          .is("telephely_id", null); // Only update if currently null to avoid overwriting moves

        // Update the user's profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ full_name: fullName || null })
          .eq("user_id", userId);

        if (updateError) {
          console.error("Error updating user:", updateError);
          return new Response(JSON.stringify({ error: "Failed to update user" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update role if provided
        if (role) {
          console.log(`update-user: Updating role for ${userId} to ${role}`);
          // Validate role
          if (!['user', 'klinika_admin'].includes(role)) {
            return new Response(JSON.stringify({ error: "Invalid role" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Update telephely_memberships - use UPSERT to handle missing rows (legacy users)
          const { error: membershipError } = await supabaseAdmin
            .from("telephely_memberships")
            .upsert({
              user_id: userId,
              telephely_id: telephelyId,
              role: role
            }, { onConflict: 'user_id, telephely_id' });

          if (membershipError) {
            console.error("Error updating membership role:", membershipError);
          }

          // Update user_roles (legacy/compat)
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .update({ role: role })
            .eq("user_id", userId);

          // If update failed (maybe row missing?), try insert via upsert or delete/insert
          if (roleError) {
            console.error("Error updating user_role:", roleError);
          }
        }

        console.log(`User ${userId} updated by klinika_admin ${caller.id}`);

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-user-completely": {
        const { email } = params;

        if (!email) {
          return new Response(JSON.stringify({ error: "Email is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find the user by email - use pagination to find all users
        let targetUser = null;
        let page = 1;
        const perPage = 1000;

        while (!targetUser) {
          const { data: { users: authUsers }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });

          if (listError) {
            console.error("Error listing users:", listError);
            return new Response(JSON.stringify({ error: "Failed to search for user" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          targetUser = authUsers?.find(u => u.email?.toLowerCase() === email.toLowerCase());

          if (!authUsers || authUsers.length < perPage) {
            // No more pages
            break;
          }
          page++;
        }

        if (!targetUser) {
          return new Response(JSON.stringify({ error: "User not found with this email" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const targetUserId = targetUser.id;

        // Don't allow deleting yourself
        if (targetUserId === caller.id) {
          return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the user's profile info for folder deletion
        const { data: targetProfile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, company_id, telephely_id, current_telephely_id")
          .eq("user_id", targetUserId)
          .single();

        // For klinika_admin (not full admin), check if user is in their organization
        if (!isAdmin) {
          // User must be in same company/telephely OR have no company (orphan user)
          const isInOrg = targetProfile?.company_id === companyId && targetProfile?.telephely_id === telephelyId;
          const isOrphan = !targetProfile?.company_id && !targetProfile?.telephely_id;

          if (!isInOrg && !isOrphan) {
            return new Response(JSON.stringify({ error: "You can only delete users within your organization" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // Check if user has other memberships
        const { data: otherMemberships } = await supabaseAdmin
          .from("telephely_memberships")
          .select("company_id, telephely_id")
          .eq("user_id", targetUserId)
          .neq("telephely_id", telephelyId); // Exclude current telephely

        const hasOtherMemberships = otherMemberships && otherMemberships.length > 0;

        // ---------------------------------------------------------------
        // SOFT-DELETE path: always used by klinika_admin.
        // Also used by full admins when the user belongs to other telephelys.
        // Keeps the auth account alive; only removes the user from this telephely.
        // ---------------------------------------------------------------
        if (!isAdmin || hasOtherMemberships) {
          console.log(`Soft-removing user ${targetUserId} from telephely ${telephelyId}. hasOtherMemberships=${hasOtherMemberships}, isAdmin=${isAdmin}`);

          // 1. Remove telephely membership
          const { error: deleteMemError } = await supabaseAdmin
            .from("telephely_memberships")
            .delete()
            .eq("user_id", targetUserId)
            .eq("telephely_id", telephelyId);

          if (deleteMemError) {
            console.error("Error removing membership:", deleteMemError);
            return new Response(JSON.stringify({ error: "Failed to remove user from organization" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // 2. Update profile
          if (hasOtherMemberships) {
            // Point profile at another membership so the user keeps a valid context
            const pointsHere = targetProfile?.telephely_id === telephelyId ||
              (targetProfile as any)?.current_telephely_id === telephelyId;
            if (pointsHere) {
              const nextMem = otherMemberships[0];
              await supabaseAdmin
                .from("profiles")
                .update({
                  telephely_id: nextMem.telephely_id,
                  current_telephely_id: nextMem.telephely_id,
                })
                .eq("user_id", targetUserId);
            }
          } else {
            // No other memberships — detach from company/telephely entirely
            await supabaseAdmin
              .from("profiles")
              .update({ company_id: null, telephely_id: null, current_telephely_id: null })
              .eq("user_id", targetUserId);
          }

          // 3. Drop Flexi connection for this telephely — clears immediately in the client
          await supabaseAdmin
            .from("flexi_auth")
            .delete()
            .eq("user_id", targetUserId)
            .eq("telephely_id", telephelyId);

          // 4. Release any license the user held in this company
          await supabaseAdmin
            .from("licenses")
            .update({ assigned_user_id: null, status: "available" })
            .eq("company_id", companyId)
            .eq("assigned_user_id", targetUserId);

          const msg = hasOtherMemberships
            ? "User removed from organization (account kept active for other organizations)"
            : "User removed from telephely (account preserved)";

          console.log(`User ${targetUserId} soft-removed from telephely ${telephelyId} by ${caller.id}`);
          return new Response(JSON.stringify({ success: true, message: msg }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // ---------------------------------------------------------------
        // HARD-DELETE path: only reached by a full admin when the user has
        // no other telephely memberships.
        // ---------------------------------------------------------------
        console.log(`Admin ${caller.id} hard-deleting user ${targetUserId} (no other memberships).`);

        // Delete user's folder from storage if they had a company and telephely
        if (targetProfile?.company_id && targetProfile?.telephely_id) {
          try {
            // Get company and telephely names
            const [companyResult, telephelyResult] = await Promise.all([
              supabaseAdmin.from("companies").select("name").eq("id", targetProfile.company_id).single(),
              supabaseAdmin.from("telephely").select("name").eq("id", targetProfile.telephely_id).single(),
            ]);

            if (companyResult.data?.name && telephelyResult.data?.name) {
              const charMap: Record<string, string> = {
                'á': 'a', 'Á': 'A', 'é': 'e', 'É': 'E', 'í': 'i', 'Í': 'I',
                'ó': 'o', 'Ó': 'O', 'ö': 'o', 'Ö': 'O', 'ő': 'o', 'Ő': 'O',
                'ú': 'u', 'Ú': 'U', 'ü': 'u', 'Ü': 'U', 'ű': 'u', 'Ű': 'U',
              };
              const sanitize = (str: string) => str.split('').map(char => charMap[char] || char).join('').replace(/\s+/g, ' ').trim();

              const userName = targetProfile.full_name || email.split('@')[0];
              const sanitizedCompany = sanitize(companyResult.data.name);
              const sanitizedTelephely = sanitize(telephelyResult.data.name);
              const sanitizedUser = sanitize(userName);

              const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/Users/${sanitizedUser}`;
              console.log(`Deleting user folder: ${folderPath}`);

              const { data: files, error: listError } = await supabaseAdmin.storage
                .from("client-files")
                .list(folderPath, { limit: 1000 });

              if (listError) {
                console.error("Error listing user folder:", listError);
              } else if (files && files.length > 0) {
                const filePaths = files.map(f => `${folderPath}/${f.name}`);
                const { error: deleteFilesError } = await supabaseAdmin.storage
                  .from("client-files")
                  .remove(filePaths);
                if (deleteFilesError) {
                  console.error("Error deleting user files:", deleteFilesError);
                } else {
                  console.log(`Deleted ${filePaths.length} files from user folder`);
                }
              } else {
                console.log(`No files found in user folder: ${folderPath}`);
              }
            }
          } catch (folderError) {
            console.error("Error deleting user folder:", folderError);
          }
        }

        // Delete from all related tables (foreign key safety)
        console.log(`Hard-deleting user ${targetUserId} (${email}) - cleaning up related data...`);
        // Release any license the user held (same as soft-delete path)
        await supabaseAdmin
          .from("licenses")
          .update({ assigned_user_id: null, status: "available" })
          .eq("assigned_user_id", targetUserId);
        await supabaseAdmin.from("telephely_memberships").delete().eq("user_id", targetUserId);
        await supabaseAdmin.from("invitations").delete().eq("invited_user_id", targetUserId);
        await supabaseAdmin.from("invitations").delete().eq("invited_by_user_id", targetUserId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", targetUserId);
        await supabaseAdmin.from("folder_access").delete().eq("user_id", targetUserId);
        await supabaseAdmin.from("flexi_auth").delete().eq("user_id", targetUserId);
        await supabaseAdmin.from("profiles").delete().eq("user_id", targetUserId);

        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
        if (deleteAuthError) {
          console.error("Error deleting auth user:", deleteAuthError);
          return new Response(JSON.stringify({ error: "Failed to delete auth user: " + deleteAuthError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`User ${targetUserId} (${email}) completely deleted by admin ${caller.id}`);
        return new Response(JSON.stringify({ success: true, deletedEmail: email }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "debug-sync": {
        // Allow calling with a secret key to bypass auth for debugging
        const { telephelyId, debugKey } = params;

        if (debugKey !== "super-secret-debug-key-1234") {
          if (!isAdmin) {
            return new Response(JSON.stringify({ error: "Admin only or valid debug key required" }), { status: 403, headers: corsHeaders });
          }
        }

        if (telephelyId === "LIST") {
          const { data: allTelephelys } = await supabaseAdmin.from("telephely").select("id, name");
          return new Response(JSON.stringify({ telephelys: allTelephelys }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        console.log(`DEBUG-SYNC: Starting for telephely ${telephelyId}`);

        // 1. Get legacy profiles
        const { data: legacyProfiles, error: legacyError } = await supabaseAdmin
          .from("profiles")
          .select("user_id, telephely_id, current_telephely_id, full_name")
          .or(`telephely_id.eq.${telephelyId},current_telephely_id.eq.${telephelyId}`);

        // 2. Get existing memberships
        const { data: memberships, error: memError } = await supabaseAdmin
          .from("telephely_memberships")
          .select("user_id")
          .eq("telephely_id", telephelyId);

        const existingIds = new Set(memberships?.map(m => m.user_id) || []);
        const missing = legacyProfiles?.filter(p => !existingIds.has(p.user_id)) || [];

        return new Response(JSON.stringify({
          telephelyId,
          legacyProfilesCount: legacyProfiles?.length,
          legacyProfiles: legacyProfiles,
          existingMembershipsCount: memberships?.length,
          existingMemberIds: Array.from(existingIds),
          missingUsersCount: missing.length,
          missingUsers: missing,
          errors: { legacyError, memError }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      case "assign-user-memberships": {
        // Admin-only operation to assign users to multiple company/telephely pairs
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Admin access required for this operation" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { userId, memberships } = params;

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!Array.isArray(memberships) || memberships.length === 0) {
          return new Response(JSON.stringify({ error: "memberships array is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate memberships structure
        for (const membership of memberships) {
          if (!membership.company_id || !membership.telephely_id || !membership.role) {
            return new Response(JSON.stringify({ error: "Each membership must have company_id, telephely_id, and role" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        console.log(`Admin ${caller.id} assigning user ${userId} to ${memberships.length} telephelys`);

        // Delete existing memberships first to handle deassignments
        const { error: deleteError } = await supabaseAdmin
          .from("telephely_memberships")
          .delete()
          .eq("user_id", userId);

        if (deleteError) {
          console.error("Error deleting old memberships:", deleteError);
          return new Response(JSON.stringify({ error: "Failed to clear old memberships: " + deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Insert new memberships
        const membershipInserts = memberships.map(m => ({
          user_id: userId,
          telephely_id: m.telephely_id,
          role: m.role,
        }));

        const { error: membershipError } = await supabaseAdmin
          .from("telephely_memberships")
          .insert(membershipInserts);

        if (membershipError) {
          console.error("Error creating memberships:", membershipError);
          return new Response(JSON.stringify({ error: "Failed to create memberships: " + membershipError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update profile with first assignment for backward compatibility
        const firstAssignment = memberships[0];
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update({
            company_id: firstAssignment.company_id,
            telephely_id: firstAssignment.telephely_id,
            current_telephely_id: firstAssignment.telephely_id,
          })
          .eq("user_id", userId);

        if (profileError) {
          console.error("Error updating profile:", profileError);
          // Not critical, continue
        }

        // Also sync to user_roles for global RLS compatibility
        // We take the role from the first membership as the primary global role
        console.log(`Syncing role ${firstAssignment.role} to user_roles for user ${userId}`);

        // Delete existing roles first to avoid duplicates and correctly update
        const { error: roleDeleteError } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", userId);

        if (roleDeleteError) {
          console.error("Error deleting old roles:", roleDeleteError);
        }

        const { error: roleInsertError } = await supabaseAdmin
          .from("user_roles")
          .insert({
            user_id: userId,
            role: firstAssignment.role
          });

        if (roleInsertError) {
          console.error("Error syncing role to user_roles:", roleInsertError);
          // Return this as a warning but don't fail the whole operation
        }

        console.log(`Successfully assigned user ${userId} to ${memberships.length} telephelys`);

        return new Response(JSON.stringify({
          success: true,
          assignedCount: memberships.length,
          roleUpdated: !roleInsertError
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown operation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : "";
    console.error(`Edge Function Error [${new Date().toISOString()}]:`, errorMessage);
    if (errorStack) console.error(errorStack);

    return new Response(JSON.stringify({
      error: errorMessage,
      details: errorStack,
      timestamp: new Date().toISOString()
    }), {
      status: 200, // Return 200 so we can see the error in the UI clearly if we handle it there, or keep 500
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});