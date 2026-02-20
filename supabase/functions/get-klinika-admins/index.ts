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

    // Get user's telephely from their profile (check both fields)
    const { data: userProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("telephely_id, current_telephely_id")
      .eq("user_id", user.id)
      .single();

    const activeTelephelyId = userProfile?.telephely_id || userProfile?.current_telephely_id;

    if (profileError || !activeTelephelyId) {
      return new Response(JSON.stringify({ admins: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client to fetch klinika admins (bypass RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get admin user_ids directly from telephely_memberships (more reliable than user_roles)
    const { data: adminMemberships, error: memError } = await serviceClient
      .from("telephely_memberships")
      .select("user_id")
      .eq("telephely_id", activeTelephelyId)
      .eq("role", "klinika_admin");

    if (memError || !adminMemberships?.length) {
      return new Response(JSON.stringify({ admins: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUserIds = adminMemberships.map((m) => m.user_id);

    // Fetch profiles for those admins
    const { data: profiles, error: profilesError } = await serviceClient
      .from("profiles")
      .select("user_id, full_name, phone")
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
