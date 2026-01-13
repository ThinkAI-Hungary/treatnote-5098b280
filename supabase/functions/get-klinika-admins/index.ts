import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create client with user token to get their profile
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user and get their profile
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's telephely from their profile
    const { data: userProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("telephely_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !userProfile?.telephely_id) {
      return new Response(JSON.stringify({ admins: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to fetch klinika admins (bypass RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get all klinika_admin user IDs
    const { data: klinikaAdminRoles, error: rolesError } = await serviceClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "klinika_admin");

    if (rolesError || !klinikaAdminRoles?.length) {
      return new Response(JSON.stringify({ admins: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUserIds = klinikaAdminRoles.map((r) => r.user_id);

    // Get profiles for those users that are in the same telephely
    const { data: profiles, error: profilesError } = await serviceClient
      .from("profiles")
      .select("user_id, full_name, phone")
      .eq("telephely_id", userProfile.telephely_id)
      .in("user_id", adminUserIds);

    if (profilesError) {
      console.error("Error fetching admin profiles:", profilesError);
      return new Response(JSON.stringify({ admins: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admins = (profiles || []).map((p) => ({
      id: p.user_id,
      full_name: p.full_name,
      phone: p.phone,
    }));

    return new Response(JSON.stringify({ admins }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-klinika-admins:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
