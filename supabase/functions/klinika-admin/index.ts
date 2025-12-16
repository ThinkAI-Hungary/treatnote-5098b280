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

    // Check if caller is klinika_admin
    const { data: isKlinikaAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "klinika_admin",
    });

    if (!isKlinikaAdmin) {
      return new Response(JSON.stringify({ error: "Klinika Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get caller's company and telephely
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("company_id, telephely_id, company_name")
      .eq("user_id", caller.id)
      .single();

    if (!callerProfile?.company_id || !callerProfile?.telephely_id) {
      return new Response(JSON.stringify({ error: "Klinika Admin must have company and telephely assigned" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { operation, ...params } = await req.json();
    console.log(`Klinika Admin operation: ${operation} by user ${caller.id}`);

    switch (operation) {
      case "get-users": {
        // Get all users in the same company and telephely
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from("profiles")
          .select(`
            user_id,
            full_name,
            company_id,
            company_name,
            telephely_id,
            subscription_status,
            subscription_plan,
            subscription_end_date
          `)
          .eq("company_id", callerProfile.company_id)
          .eq("telephely_id", callerProfile.telephely_id);

        if (profilesError) {
          console.error("Error fetching profiles:", profilesError);
          return new Response(JSON.stringify({ error: "Failed to fetch users" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get auth users for email info
        const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers();
        
        // Get user roles
        const userIds = profiles?.map(p => p.user_id) || [];
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);

        // Get telephely name
        const { data: telephely } = await supabaseAdmin
          .from("telephely")
          .select("name")
          .eq("id", callerProfile.telephely_id)
          .single();

        // Combine data
        const users = profiles?.map(profile => {
          const authUser = authUsers?.find(u => u.id === profile.user_id);
          const userRole = roles?.find(r => r.user_id === profile.user_id);
          return {
            id: profile.user_id,
            email: authUser?.email || "Unknown",
            full_name: profile.full_name,
            company_name: profile.company_name,
            telephely_name: telephely?.name || null,
            subscription_status: profile.subscription_status,
            role: userRole?.role || "user",
          };
        }) || [];

        return new Response(JSON.stringify({ users, companyName: callerProfile.company_name, telephelyName: telephely?.name }), {
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

        const availableUsers = confirmedUsers
          .filter(authUser => {
            const profile = profiles?.find(p => p.user_id === authUser.id);
            // User is available if they have no company/telephely OR different company/telephely
            // But exclude admins and klinika_admins
            const userRole = roles?.find(r => r.user_id === authUser.id);
            if (userRole?.role === 'admin' || userRole?.role === 'klinika_admin') return false;
            
            if (!profile) return true;
            return !profile.company_id || !profile.telephely_id || 
                   profile.company_id !== callerProfile.company_id || 
                   profile.telephely_id !== callerProfile.telephely_id;
          })
          .map(authUser => {
            const profile = profiles?.find(p => p.user_id === authUser.id);
            return {
              id: authUser.id,
              email: authUser.email,
              full_name: profile?.full_name || null,
              has_company: !!profile?.company_id,
            };
          });

        return new Response(JSON.stringify({ users: availableUsers }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "invite-user": {
        const { userId } = params;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update the user's profile with the klinika admin's company and telephely
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            company_id: callerProfile.company_id,
            telephely_id: callerProfile.telephely_id,
          })
          .eq("user_id", userId);

        if (updateError) {
          console.error("Error inviting user:", updateError);
          return new Response(JSON.stringify({ error: "Failed to invite user" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`User ${userId} invited to company ${callerProfile.company_id} and telephely ${callerProfile.telephely_id}`);

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
          .eq("company_id", callerProfile.company_id)
          .eq("telephely_id", callerProfile.telephely_id);

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
        const { email, password, fullName } = params;

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

        // Create profile with the klinika admin's company and telephely
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .insert({
            user_id: newUser.user.id,
            full_name: fullName || email.split("@")[0],
            company_id: callerProfile.company_id,
            telephely_id: callerProfile.telephely_id,
          });

        if (profileError) {
          console.error("Error creating profile:", profileError);
        }

        // Delete any existing roles and create user role
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
        
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: newUser.user.id, role: "user" });

        if (roleError) {
          console.error("Error creating role:", roleError);
        }

        console.log(`User ${newUser.user.id} created by klinika_admin ${caller.id} with company ${callerProfile.company_id}`);

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
