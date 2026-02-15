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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse the operation first to determine access level needed
    const { operation, ...params } = await req.json();
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

    // For all other operations, check if caller is klinika_admin or admin
    const { data: isKlinikaAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "klinika_admin",
    });

    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isKlinikaAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Klinika Admin or Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's company and telephely
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, telephely_id, company_name")
      .eq("user_id", caller.id)
      .single();

    // For klinika_admin, company and telephely are required
    // For admin, they can access but some operations require company/telephely
    const hasCompanyAndTelephely = callerProfile?.company_id && callerProfile?.telephely_id;

    if (!isAdmin && !hasCompanyAndTelephely) {
      console.log(`User ${caller.id} is klinika_admin but has no company/telephely assigned`);
      return new Response(JSON.stringify({ error: "Klinika Admin must have company and telephely assigned" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`User ${caller.id} accessing klinika-admin: isAdmin=${isAdmin}, isKlinikaAdmin=${isKlinikaAdmin}, hasCompanyAndTelephely=${hasCompanyAndTelephely}`);

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
      return new Response(JSON.stringify({ error: "Company and telephely required for this operation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // At this point, callerProfile is guaranteed to have company_id and telephely_id
    const companyId = callerProfile.company_id!;
    const telephelyId = callerProfile.telephely_id!;
    const companyName = callerProfile.company_name;

    switch (operation) {
      case "get-users": {
        console.log(`get-users: Fetching users for company ${companyId}, telephely ${telephelyId}`);

        // Get all members of the telephely
        const { data: memberships, error: membersError } = await supabaseAdmin
          .from("telephely_memberships")
          .select(`
            user_id,
            role,
            profiles:user_id (
              user_id,
              full_name,
              subscription_status,
              subscription_plan,
              subscription_end_date
            )
          `)
          .eq("telephely_id", telephelyId);

        if (membersError) {
          console.error("Error fetching memberships:", membersError);
          return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`get-users: Found ${memberships?.length || 0} members for telephely ${telephelyId}`);

        // Get auth users for email info
        const userIds = memberships?.map(m => m.user_id) || [];
        // We can't efficiently filter listUsers by ID list, so we might need to fetch all or use a different approach?
        // Admin `listUsers` doesn't support filtering by ID list easily in one go.
        // However, for a single clinic, user count is low. We can fetch all and map? Or fetch individually if small?
        // Optimization: For now, fetch all (up to page limit) and filter. Or just don't show email if not feasible?
        // Better: Use `supabaseAdmin.auth.admin.getUserById` locally in loop (slow) or `listUsers` (pagination).
        // Let's assume listUsers returns enough or we page through it? 
        // Actually, `listUsers` is paginated. If we have 1000 users, we might miss some.
        // But for this use case, likely <50 users per clinic.
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

        // Get telephely name
        const { data: telephely } = await supabaseAdmin
          .from("telephely")
          .select("name")
          .eq("id", telephelyId)
          .single();

        // Combine data
        const users = memberships?.map(member => {
          const profile = (member.profiles as any) || {}; // Handle array or object return depending on relation
          // Supabase join usually returns object if 1:1, or array 1:N. user_id is PK in profiles, so 1:1?
          // But here it's `profiles:user_id`.
          // Let's treat it safely.
          const profileData = Array.isArray(profile) ? profile[0] : profile;

          const authUser = authUsers?.find(u => u.id === member.user_id);

          return {
            id: member.user_id,
            email: authUser?.email || "Unknown",
            full_name: profileData?.full_name,
            company_name: companyName, // Inferred from context
            telephely_name: telephely?.name || null,
            subscription_status: profileData?.subscription_status,
            role: member.role, // Use role from membership
          };
        }) || [];

        console.log(`get-users: Returning ${users.length} users for ${companyName} - ${telephely?.name}`);

        return new Response(JSON.stringify({ users, companyName: companyName, telephelyName: telephely?.name }), {
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
        if (!['user', 'klinika_admin'].includes(inviteRole)) {
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
            invited_email
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

        const { error } = await supabaseAdmin
          .from("invitations")
          .delete()
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
        const userRole = role || 'user'; // Default to user if not specified

        if (!email || !password) {
          return new Response(JSON.stringify({ error: "Email and password are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (password.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
            status: 400,
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
          },
        });

        if (createError) {
          console.error("Error creating user:", createError);
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
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
          .insert({
            user_id: newUser.user.id,
            telephely_id: telephelyId,
            role: userRole
          });

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
        const { userId, fullName } = params;

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
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

        // Verify the user is in the same organization
        const { data: targetProfile } = await supabaseAdmin
          .from("profiles")
          .select("company_id, telephely_id")
          .eq("user_id", userId)
          .single();

        if (!isAdmin && (!targetProfile || targetProfile.company_id !== companyId || targetProfile.telephely_id !== telephelyId)) {
          return new Response(JSON.stringify({ error: "You can only update users within your organization" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

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
          .select("full_name, company_id, telephely_id")
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

        // Delete user's folder from storage if they had a company and telephely
        if (targetProfile?.company_id && targetProfile?.telephely_id) {
          try {
            // Get company and telephely names
            const [companyResult, telephelyResult] = await Promise.all([
              supabaseAdmin.from("companies").select("name").eq("id", targetProfile.company_id).single(),
              supabaseAdmin.from("telephely").select("name").eq("id", targetProfile.telephely_id).single(),
            ]);

            if (companyResult.data?.name && telephelyResult.data?.name) {
              // Sanitize path by converting Hungarian/special characters to ASCII equivalents and keeping spaces
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

              // List all files in the user's folder
              const { data: files, error: listError } = await supabaseAdmin.storage
                .from("client-files")
                .list(folderPath, { limit: 1000 });

              if (listError) {
                console.error("Error listing user folder:", listError);
              } else if (files && files.length > 0) {
                // Delete all files in the folder
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
            // Continue with user deletion even if folder deletion fails
          }
        }

        // Delete from all related tables first (foreign key safety)
        console.log(`Deleting user ${targetUserId} (${email}) - cleaning up related data...`);

        // Delete invitations (both sent and received)
        await supabaseAdmin.from("invitations").delete().eq("invited_user_id", targetUserId);
        await supabaseAdmin.from("invitations").delete().eq("invited_by_user_id", targetUserId);

        // Delete user roles
        await supabaseAdmin.from("user_roles").delete().eq("user_id", targetUserId);

        // Delete folder access
        await supabaseAdmin.from("folder_access").delete().eq("user_id", targetUserId);

        // Delete flexi auth
        await supabaseAdmin.from("flexi_auth").delete().eq("user_id", targetUserId);

        // Delete profile
        await supabaseAdmin.from("profiles").delete().eq("user_id", targetUserId);

        // Finally, delete the auth user
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

        if (deleteAuthError) {
          console.error("Error deleting auth user:", deleteAuthError);
          return new Response(JSON.stringify({ error: "Failed to delete auth user: " + deleteAuthError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`User ${targetUserId} (${email}) completely deleted (including storage folder) by ${caller.id}`);

        return new Response(JSON.stringify({ success: true, deletedEmail: email }), {
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
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});