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
    const { email, password, fullName, role, telephely } = await req.json();

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

    // Create profile for the new user with telephely
    const profileData: Record<string, any> = {
      user_id: newUser.user.id,
      full_name: fullName || email.split("@")[0],
      role: userRole === 'admin' ? 'admin' : 'user', // Profile role is less important now
    };

    if (telephely) {
      profileData.telephely = telephely; // Legacy
      // We need telephely_id. But 'telephely' param here seems to be the ID based on usage?
      // existing code: profileData.telephely = telephely;
      // It assumes 'telephely' is the column name match? 
      // The profile table has 'telephely' (string?) and 'telephely_id' (uuid).
      // Let's assume input 'telephely' is the ID.
      // But verify if it's stored in 'telephely' column or 'telephely_id'.
      // existing code inserts into 'telephely'.
      // I should update it to set telephely_id and current_telephely_id.
      profileData.telephely_id = telephely;
      profileData.current_telephely_id = telephely;
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert(profileData);

    if (profileError) {
      console.error("Error creating profile:", profileError);
    }

    // Handle Roles
    if (userRole === 'admin') {
      // Global Admin -> user_roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: newUser.user.id,
          role: 'admin',
        });
      if (roleError) console.error("Error creating admin role:", roleError);
    } else {
      // Klinika Admin or User -> telephely_memberships
      if (telephely) {
        const { error: membershipError } = await supabaseAdmin
          .from("telephely_memberships")
          .insert({
            user_id: newUser.user.id,
            telephely_id: telephely,
            role: userRole,
          });

        if (membershipError) console.error("Error creating membership:", membershipError);
      }
    }

    console.log(`User created with role: ${userRole}, telephely: ${telephely || 'none'}`);

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