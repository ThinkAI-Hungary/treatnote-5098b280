import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { operation, ...params } = await req.json();
    console.log(`Invitation handler operation: ${operation}`);

    switch (operation) {
      case "verify-token": {
        const { token } = params;
        if (!token) {
          return new Response(JSON.stringify({ error: "Token is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find invitation by token
        const { data: invitation, error: invError } = await supabaseAdmin
          .from("invitations")
          .select(`
            id,
            status,
            invited_email,
            company_id,
            telephely_id,
            invited_by_user_id,
            role,
            companies(name),
            telephely(name)
          `)
          .eq("invitation_token", token)
          .single();

        if (invError || !invitation) {
          console.error("Invitation not found:", invError);
          return new Response(JSON.stringify({ error: "Meghívó nem található" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (invitation.status !== "pending") {
          return new Response(JSON.stringify({ error: "Ez a meghívó már fel lett használva" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get inviter name
        const { data: inviterProfile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("user_id", invitation.invited_by_user_id)
          .single();

        const companyData = invitation.companies as unknown as { name: string } | null;
        const telephelyData = invitation.telephely as unknown as { name: string } | null;

        return new Response(JSON.stringify({
          invitation: {
            id: invitation.id,
            company_name: companyData?.name || "Ismeretlen",
            telephely_name: telephelyData?.name || "Ismeretlen",
            invited_by_name: inviterProfile?.full_name || "Ismeretlen",
            role: invitation.role,
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "respond-invitation": {
        const { token, response } = params;
        if (!token || !response) {
          return new Response(JSON.stringify({ error: "Token and response are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response !== "accepted" && response !== "declined") {
          return new Response(JSON.stringify({ error: "Response must be 'accepted' or 'declined'" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the authorization header to identify the logged-in user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Authentication required" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find the invitation
        const { data: invitation, error: invError } = await supabaseAdmin
          .from("invitations")
          .select("*")
          .eq("invitation_token", token)
          .eq("status", "pending")
          .single();

        if (invError || !invitation) {
          console.error("Invitation not found or already used:", invError);
          return new Response(JSON.stringify({ error: "Meghívó nem található vagy már lejárt" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Verify the user's email matches the invitation (if invited_email is set)
        if (invitation.invited_email && invitation.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
          console.error(`Email mismatch: invitation for ${invitation.invited_email}, but user is ${user.email}`);
          return new Response(JSON.stringify({ error: "Ez a meghívó nem ehhez az email címhez tartozik" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update invitation status
        const { error: updateError } = await supabaseAdmin
          .from("invitations")
          .update({
            status: response,
            responded_at: new Date().toISOString(),
            invited_user_id: user.id, // Link the actual user who responded
            used_at: response === "accepted" ? new Date().toISOString() : null,
          })
          .eq("id", invitation.id);

        if (updateError) {
          console.error("Error updating invitation:", updateError);
          return new Response(JSON.stringify({ error: "Hiba a válasz mentésekor" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response === "accepted") {
          // Add user to company by updating their profile (Legacy support + UI context)
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update({
              current_telephely_id: invitation.telephely_id,
              // Maintain backward compatibility for now
              company_id: invitation.company_id,
              telephely_id: invitation.telephely_id,
            })
            .eq("user_id", user.id);

          if (profileError) {
            console.error("Error updating profile:", profileError);
            // Don't fail the whole request but log it
          }

          // Create Telephely Membership
          const { error: membershipError } = await supabaseAdmin
            .from("telephely_memberships")
            .insert({
              user_id: user.id,
              telephely_id: invitation.telephely_id,
              role: invitation.role || 'user',
            });

          if (membershipError) {
            console.error("Error creating membership:", membershipError);
            return new Response(JSON.stringify({ error: "Hiba a jogosultságok beállításakor" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`User ${user.id} accepted invitation and joined telephely ${invitation.telephely_id}`);
        } else {
          console.log(`User ${user.id} declined invitation to company ${invitation.company_id}`);
        }

        return new Response(JSON.stringify({ success: true, response }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send-invitation-email": {
        // This operation is called by klinika-admin to send an email invitation
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(JSON.stringify({ error: "Authentication required" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

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

        // Check if caller is klinika_admin or admin
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

        const { email, role, full_name } = params; // Accepted role and full_name params
        if (!email || !email.includes("@")) {
          return new Response(JSON.stringify({ error: "Valid email is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate role
        const validRoles = ['user', 'klinika_admin'];
        const inviteRole = role && validRoles.includes(role) ? role : 'user';

        // Get caller's company and telephely (Current Context)
        const { data: callerProfile } = await supabaseAdmin
          .from("profiles")
          .select("company_id, telephely_id, full_name, current_telephely_id")
          .eq("user_id", caller.id)
          .single();

        // Use current_telephely_id if available, fallback to telephely_id
        const targetTelephelyId = callerProfile?.current_telephely_id || callerProfile?.telephely_id;
        const targetCompanyId = callerProfile?.company_id; // Company ID might need to be fetched from telephely if switching company is possible

        if (!targetCompanyId || !targetTelephelyId) {
          return new Response(JSON.stringify({ error: "You must have a company and telephely assigned" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if there's already a pending invitation for this email
        const { data: existingInvitation } = await supabaseAdmin
          .from("invitations")
          .select("id")
          .eq("invited_email", email.toLowerCase())
          .eq("company_id", targetCompanyId)
          .eq("telephely_id", targetTelephelyId)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString()) // Check expiry
          .maybeSingle();

        if (existingInvitation) {
          return new Response(JSON.stringify({ error: "Már van érvényes függőben lévő meghívás ehhez az email címhez" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Generate a new invitation token
        const invitationToken = crypto.randomUUID();

        // Create the invitation
        const { data: newInvitation, error: insertError } = await supabaseAdmin
          .from("invitations")
          .insert({
            invited_email: email.toLowerCase(),
            invited_by_user_id: caller.id,
            company_id: targetCompanyId,
            telephely_id: targetTelephelyId,
            role: inviteRole,
            full_name: full_name || null,
            status: "pending",
            invitation_token: invitationToken,
            invited_user_id: caller.id, // Temporary placeholder
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error creating invitation:", insertError);
          return new Response(JSON.stringify({ error: "Hiba a meghívó létrehozásakor" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get company and telephely names for the email
        const { data: companyData } = await supabaseAdmin
          .from("companies")
          .select("name")
          .eq("id", targetCompanyId)
          .single();

        const { data: telephelyData } = await supabaseAdmin
          .from("telephely")
          .select("name")
          .eq("id", targetTelephelyId)
          .single();

        // Construct the invitation URL
        const referer = req.headers.get("referer") || req.headers.get("origin");
        let baseUrl = "https://bpjzgapmoyhtgryglcke.lovable.app";
        if (referer) {
          try {
            const url = new URL(referer);
            baseUrl = `${url.protocol}//${url.host}`;
          } catch { }
        }

        // Determine if user exists to send correct link type?
        // Logic says: "If email belongs to existing... notification... If NOT... register"
        // The URL is the same: /accept-invitation?token=...
        // The Frontend at that URL will check if user is logged in.
        // If logged in: "Join" button.
        // If not logged in: "Register" or "Login" options. 
        // Actually, for new users, we want a direct register flow.
        // We can pass a hint e.g. /register?token=... if we know they don't exist.
        // checking auth.users here requires admin privs on supabaseAdmin.

        /*
        const { data: existingUser } = await supabaseAdmin.from('auth.users').select('id').eq('email', email).single(); 
        // Note: Direct access to auth schema via postgrest is not standard unless exposed. 
        // Using auth admin API:
        */
        // supabaseAdmin.auth.admin.listUsers() is pagination based. getByEmail isn't direct in JS SDK v2 admin easily without getting user by id? 
        // Actually listUsers({ email: ... }) works.
        // But for now, we send the general link. Frontend handles the UX.

        const invitationUrl = `${baseUrl}/accept-invitation?token=${invitationToken}`;

        console.log(`Invitation created for ${email}`);
        console.log(`Invitation URL: ${invitationUrl}`);
        console.log(`Company: ${companyData?.name}, Telephely: ${telephelyData?.name}`);
        console.log(`Invited by: ${callerProfile.full_name}`);

        return new Response(JSON.stringify({
          success: true,
          message: "Meghívó létrehozva",
          invitation_url: invitationUrl,
          email: email,
          company_name: companyData?.name,
          telephely_name: telephelyData?.name,
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
    console.error("Error in invitation-handler:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
