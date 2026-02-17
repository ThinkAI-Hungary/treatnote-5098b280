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

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is an admin
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

    // Check if caller is admin using has_role function
    const { data: isAdmin } = await supabaseClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { email, password, fullName, role, telephely, companyId, telephelyId } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email/username and password are required" }), {
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

    // Validate role if provided
    const validRoles = ['user', 'admin', 'klinika_admin'];
    const userRole = role && validRoles.includes(role) ? role : 'user';

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Determine if it's an email or username (check if it ends with @localuser.com)
    const isLocalUser = email.endsWith("@localuser.com");

    // Create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password,
      email_confirm: true, // Auto-confirm since admin is creating
      user_metadata: {
        full_name: fullName || email.split("@")[0],
        is_username_login: isLocalUser,
        original_username: isLocalUser ? email.split("@")[0] : undefined,
        admin_created: true, // Bypass invite trigger
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the effective telephely ID and company ID
    const effectiveTelephelyId = telephelyId || null;
    const effectiveCompanyId = companyId || null;

    // Build the profile update data
    const profileUpdate: Record<string, any> = {
      full_name: fullName || email.split("@")[0],
    };

    if (effectiveTelephelyId) {
      profileUpdate.telephely_id = effectiveTelephelyId;
      profileUpdate.current_telephely_id = effectiveTelephelyId;
    }

    if (effectiveCompanyId) {
      profileUpdate.company_id = effectiveCompanyId;
    }

    // The handle_email_confirmation trigger creates a basic profile on user creation.
    // We need to UPDATE that profile with the additional data.
    // Use retry logic since the trigger runs asynchronously and may not have completed yet.
    let profileUpdated = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: updatedProfile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("user_id", newUser.user.id)
        .select("user_id")
        .maybeSingle();

      if (updatedProfile) {
        profileUpdated = true;
        console.log(`Profile updated on attempt ${attempt + 1}`);
        break;
      }

      if (profileError) {
        console.error(`Profile update attempt ${attempt + 1} error:`, profileError);
      }

      // Profile doesn't exist yet (trigger hasn't run), wait and retry
      console.log(`Profile not found on attempt ${attempt + 1}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // If update failed after retries, try inserting as fallback
    if (!profileUpdated) {
      console.log("Profile update failed after retries, attempting insert...");
      const { error: insertError } = await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: newUser.user.id,
          ...profileUpdate,
        });
      if (insertError) {
        console.error("Profile insert fallback error:", insertError);
      }
    }

    // Handle Roles
    // The handle_email_confirmation trigger inserts user_roles(role='user') by default.
    // We need to clean this up and set the correct role.
    if (userRole === 'admin') {
      // Global Admin -> replace user_roles entry with 'admin'
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: newUser.user.id,
          role: 'admin',
        });
      if (roleError) console.error("Error creating admin role:", roleError);
    } else {
      // Klinika Admin or regular User -> telephely_memberships
      // Remove the default 'user' entry from user_roles since role is determined by membership
      if (userRole === 'klinika_admin') {
        await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
      }

      if (effectiveTelephelyId) {
        // Delete any existing membership for this user+telephely first
        await supabaseAdmin
          .from("telephely_memberships")
          .delete()
          .eq("user_id", newUser.user.id)
          .eq("telephely_id", effectiveTelephelyId);

        const { error: membershipError } = await supabaseAdmin
          .from("telephely_memberships")
          .insert({
            user_id: newUser.user.id,
            telephely_id: effectiveTelephelyId,
            role: userRole,
          });

        if (membershipError) console.error("Error creating membership:", membershipError);
      }
    }

    console.log(`User created with role: ${userRole}, telephelyId: ${effectiveTelephelyId || 'none'}, companyId: ${companyId || 'none'}`);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          created_at: newUser.user.created_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});