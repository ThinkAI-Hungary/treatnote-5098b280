import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBrevoEmail, buildInvitationEmailNewUser, buildInvitationEmailExistingUser } from "../_shared/brevo.ts";

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
            invited_email: invitation.invited_email, // Added invited_email
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
        // Note: For declining, we might not strictly need auth if we validate the token ownership?
        // But the previous logic required auth to know WHO is declining.
        // Actually, if I am declining, I am logged in as the user?
        // "I get an email, I click link, I see decline button". 
        // If I am NOT logged in, I can't see the buttons in AcceptInvitation.tsx (it shows login form).
        // So yes, auth is required.

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
          // Allow declining even if mismatch? Probably not secure.
          return new Response(JSON.stringify({ error: "Ez a meghívó nem ehhez az email címhez tartozik" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (response === 'declined') {
          // UPDATE invitation status (DECLINED) - Changed from DELETE
          const { error: updateError } = await supabaseAdmin
            .from("invitations")
            .update({
              status: 'declined',
              responded_at: new Date().toISOString(),
              invited_user_id: user.id, // Link the user even if declined
            })
            .eq("id", invitation.id);

          if (updateError) {
            console.error("Error declining invitation:", updateError);
            return new Response(JSON.stringify({ error: "Hiba a válasz mentésekor" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`User ${user.id} declined invitation (status updated)`);
          return new Response(JSON.stringify({ success: true, response }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Update invitation status (ACCEPTED)
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

          // Sync legacy user_roles table so useCachedRoles picks up the correct role immediately.
          // register-invited-user already does this for new users; existing users who accept via
          // respond-invitation were previously skipped, causing them to appear as plain 'user'.
          const legacyRole = invitation.role === 'klinika_admin' ? 'klinika_admin' : 'user';
          try {
            await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id);
            await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: legacyRole });
            console.log(`Synced user_roles for user ${user.id} with role ${legacyRole}`);
          } catch (roleErr) {
            console.error("Error syncing user_roles (non-fatal):", roleErr);
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

        // Check for klinika_admin in memberships
        // Use supabaseAdmin to bypass RLS and .limit(1) to handle users with multiple admin roles
        const { data: membership } = await supabaseAdmin
          .from("telephely_memberships")
          .select("role")
          .eq("user_id", caller.id)
          .eq("role", "klinika_admin")
          .limit(1)
          .maybeSingle();

        const isKlinikaAdmin = !!membership;

        // Check for admin role directly in user_roles
        const { data: adminRole } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", caller.id)
          .eq("role", "admin")
          .limit(1)
          .maybeSingle();

        const isAdmin = !!adminRole;

        if (!isKlinikaAdmin && !isAdmin) {
          return new Response(JSON.stringify({ error: "Klinika Admin or Admin access required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { email, role, full_name, companyId, telephelyId } = params; // Accepted role, full_name, companyId, telephelyId params

        console.log(`[invitation-handler] Request Params:`, { email, role, full_name, companyId, telephelyId });
        console.log(`[invitation-handler] Caller:`, caller.id);
        console.log(`[invitation-handler] Permissions: isKlinikaAdmin=${isKlinikaAdmin}, isAdmin=${isAdmin}`);

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
        // We still fetch this to validate if the user has access to the requested company/telephely
        // OR if simple logic: if admin, allow. If klinika_admin, must match membership.

        let targetCompanyId = companyId;
        let targetTelephelyId = telephelyId;

        // If ids not provided, fallback to profile (legacy behavior)
        if (!targetCompanyId || !targetTelephelyId) {
          const { data: callerProfile } = await supabaseAdmin
            .from("profiles")
            .select("company_id, telephely_id, full_name, current_telephely_id")
            .eq("user_id", caller.id)
            .single();

          if (callerProfile) {
            targetTelephelyId = targetTelephelyId || callerProfile.current_telephely_id || callerProfile.telephely_id;
            targetCompanyId = targetCompanyId || callerProfile.company_id;
          }
        }

        if (!targetCompanyId || !targetTelephelyId) {
          console.error("[invitation-handler] Missing target context");
          return new Response(JSON.stringify({ error: "You must have a company and telephely assigned (or selected context)" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Validate Access:
        // If global admin -> ALLOW
        // If klinika_admin -> MUST verify membership in targetTelephelyId
        if (!isAdmin) {
          const { data: membershipCheck } = await supabaseAdmin
            .from("telephely_memberships")
            .select("role")
            .eq("user_id", caller.id)
            .eq("telephely_id", targetTelephelyId)
            .eq("role", "klinika_admin")
            .limit(1)
            .maybeSingle();

          if (!membershipCheck) {
            console.error(`[invitation-handler] Access Denied: Caller ${caller.id} is not klinika_admin of ${targetTelephelyId}`);
            return new Response(JSON.stringify({ error: "Nincs jogosultsága meghívót küldeni ehhez a telephelyhez" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // WRAP IN TRY-CATCH FOR DEBUGGING
        try {
          // 1. LOOKUP USER FIRST
          console.log(`Looking up user for ${email}...`);
          const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();

          if (userError) {
            console.error("Error listing users:", userError);
            throw new Error("Hiba a felhasználók listázásakor: " + userError.message);
          }

          const existingUser = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          const isNewUser = !existingUser;
          const targetUserId = existingUser ? existingUser.id : null;
          console.log(`User lookup result: Existing? ${!isNewUser}, ID: ${targetUserId}`);

          // 2. CHECK FOR EXISTING INVITATION (ANY STATUS)
          console.log(`Checking existing invitation for ${email}...`);
          const { data: existingInvitation, error: findError } = await supabaseAdmin
            .from("invitations")
            .select("id")
            .eq("invited_email", email.toLowerCase())
            .eq("company_id", targetCompanyId)
            .eq("telephely_id", targetTelephelyId)
            .maybeSingle();

          if (findError) {
            console.error("Error finding existing invitation:", findError);
            throw new Error("Adatbázis hiba (keresés): " + findError.message);
          }

          const invitationToken = crypto.randomUUID();
          let invitationId;

          if (existingInvitation) {
            // UPDATE EXISTING
            console.log(`Updating existing invitation ${existingInvitation.id} for ${email}`);
            const { error: updateError } = await supabaseAdmin
              .from("invitations")
              .update({
                status: 'pending',
                invitation_token: invitationToken,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                role: inviteRole,
                full_name: full_name || null,
                invited_user_id: targetUserId,
                responded_at: null,
                used_at: null
              })
              .eq("id", existingInvitation.id);

            if (updateError) {
              console.error("Error updating existing invitation:", updateError);
              throw new Error("Hiba a meghívó frissítésekor: " + updateError.message);
            }
            invitationId = existingInvitation.id;
            console.log("Existing invitation updated successfully.");

          } else {
            // INSERT NEW
            console.log("Creating new invitation record...");
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
                invited_user_id: targetUserId,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              })
              .select("id")
              .single();

            if (insertError) {
              console.error("Error creating invitation:", insertError);
              throw new Error("Hiba a meghívó létrehozásakor: " + insertError.message);
            }
            invitationId = newInvitation.id;
            console.log("Invitation created successfully:", invitationId);
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

          const invitationUrl = `${baseUrl}/accept-invitation?token=${invitationToken}`;

          const callerProfile = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("user_id", caller.id)
            .maybeSingle();
          const invitedByName = callerProfile.data?.full_name || caller.email || "TreatNote";

          console.log(`Invitation created for ${email} (New User: ${isNewUser})`);
          console.log(`Invitation URL: ${invitationUrl}`);
          console.log(`Company: ${companyData?.name}, Telephely: ${telephelyData?.name}`);

          // ── Send email via Brevo ────────────────────────────────────────
          const recipientName = full_name || undefined;

          const emailContent = isNewUser
            ? buildInvitationEmailNewUser({
                invitationUrl,
                invitedByName,
                companyName: companyData?.name || "Klinika",
                telephelyName: telephelyData?.name || "Telephely",
                role: inviteRole,
                recipientName,
              })
            : buildInvitationEmailExistingUser({
                invitationUrl,
                invitedByName,
                companyName: companyData?.name || "Klinika",
                telephelyName: telephelyData?.name || "Telephely",
                role: inviteRole,
                recipientName,
              });

          const emailResult = await sendBrevoEmail({
            to: { email: email.toLowerCase(), name: full_name || undefined },
            subject: emailContent.subject,
            htmlContent: emailContent.htmlContent,
            textContent: emailContent.textContent,
          });

          if (!emailResult.success) {
            console.error(`[invitation-handler] Brevo email küldési hiba (${email}):`, emailResult.error);
            // Non-fatal: the invitation record is created, URL still returned
          } else {
            console.log(`[invitation-handler] Brevo email elküldve → ${email}`);
          }

          return new Response(JSON.stringify({
            success: true,
            message: emailResult.success ? "Meghívó elküldve" : "Meghívó létrehozva (email küldés sikertelen)",
            invitation_url: invitationUrl,
            email: email,
            is_new_user: isNewUser,
            company_name: companyData?.name,
            telephely_name: telephelyData?.name,
            email_sent: emailResult.success,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (err: any) {
          console.error("CRITICAL ERROR in send-invitation-email:", err);
          // Return 200 with error field so client (supabase.functions.invoke) doesn't throw generic non-2xx error.
          // The client code explicitly checks for data.error and throws it as a readable Error.
          return new Response(JSON.stringify({ error: err.message || "Ismeretlen szerver hiba" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      case "register-invited-user": {
        try {
          const { token, password, full_name } = params;
          if (!token || !password) {
            return new Response(JSON.stringify({ error: "Token and password are required" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (password.length < 6) {
            return new Response(JSON.stringify({ error: "A jelszónak legalább 6 karakternek kell lennie" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Find the invitation
          const { data: invitation, error: invError } = await supabaseAdmin
            .from("invitations")
            .select("*")
            .eq("invitation_token", token)
            .single();

          if (invitation) {
            console.log(`[register-invited-user] Found invitation: ${invitation.id}, role: ${invitation.role}, telephely: ${invitation.telephely_id}`);
          }

          if (invError || !invitation) {
            return new Response(JSON.stringify({ error: "Meghívó nem található vagy érvénytelen" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (invitation.status !== 'pending') {
            return new Response(JSON.stringify({ error: "Ez a meghívó már nem érvényes (már felhasználták)" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Check expiry
          if (new Date(invitation.expires_at) < new Date()) {
            return new Response(JSON.stringify({ error: "A meghívó lejárt" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Create the user
          // We pass 'admin_created: true' to ensure the 'handle_invite_acceptance' trigger
          // doesn't block creation if it fails to match the invite for some reason (e.g. casing).
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: invitation.invited_email,
            password: password,
            email_confirm: true, // Auto-confirm since they have the token
            user_metadata: {
              full_name: full_name || invitation.full_name || invitation.invited_email.split('@')[0],
              admin_created: true,
            }
          });

          if (createError) {
            console.error("Error creating user:", createError);
            // Check for existing user error specifically
            if (createError.message?.includes("already registered")) {
              return new Response(JSON.stringify({ error: "Ez az email cím már regisztrálva van. Kérjük jelentkezzen be." }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify({ error: "Hiba a felhasználó létrehozásakor: " + createError.message }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          console.log(`User created via invitation: ${newUser.user.id}`);

          // Proceed to accept invitation logic (copy-paste / reuse logic from respond-invitation)
          // 1. Update invitation
          const { error: updateError } = await supabaseAdmin
            .from("invitations")
            .update({
              status: 'accepted',
              responded_at: new Date().toISOString(),
              used_at: new Date().toISOString(),
              invited_user_id: newUser.user.id
            })
            .eq("id", invitation.id);

          if (updateError) {
            console.error("Error updating invitation status:", updateError);
            // We don't block here, as user is created.
          }

          // 2. Create Profile and Memberships
          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert({
              user_id: newUser.user.id,
              full_name: full_name || invitation.full_name || invitation.invited_email.split('@')[0],
              current_telephely_id: invitation.telephely_id,
              company_id: invitation.company_id,
              telephely_id: invitation.telephely_id,
            }, { onConflict: 'user_id' }); // Must specify user_id: profiles.id is the PK, not user_id

          if (profileError) {
            console.error("Error creating profile:", profileError);
          }

          // Use upsert or insert with ignoreDuplicates to avoid conflict with Trigger
          const { error: memError } = await supabaseAdmin
            .from("telephely_memberships")
            .upsert({
              user_id: newUser.user.id,
              telephely_id: invitation.telephely_id,
              role: invitation.role || 'user',
            }, { onConflict: 'user_id, telephely_id' });

          if (memError) {
            console.error("Error creating membership:", memError);
            return new Response(JSON.stringify({ error: "Hiba a jogosultságok létrehozásakor: " + memError.message }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // SYNC TO user_roles (Legacy/Global Compatibility)
          // validRoles check is implicit if DB has constraint, but good to be safe.
          const legacyRole = invitation.role === 'klinika_admin' ? 'klinika_admin' : 'user';

          await supabaseAdmin.from("user_roles").delete().eq("user_id", newUser.user.id);
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: newUser.user.id, role: legacyRole });

          if (roleError) {
            console.error("Error syncing user_roles:", roleError);
          }

          // 3. Assign license if available
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
                .update({ assigned_user_id: newUser.user.id, status: "assigned" })
                .eq("id", availableLicense.id);
              console.log(`Auto-assigned license ${availableLicense.id} to new user ${newUser.user.id}`);
            }
          } catch (licErr) {
            console.error("Error auto-assigning license:", licErr);
          }

          return new Response(JSON.stringify({ success: true, email: invitation.invited_email }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });

        } catch (err: any) {
          console.error("CRITICAL ERROR in register-invited-user:", err);
          return new Response(JSON.stringify({ error: err.message || "Ismeretlen szerver hiba" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }


      case "check-user": {
        const { email } = params;
        if (!email) {
          return new Response(JSON.stringify({ error: "Email is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // This requires admin rights, which this function has via supabaseAdmin
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

        return new Response(JSON.stringify({
          exists: !!user,
          userId: user?.id,
          email: user?.email,
          lastSignIn: user?.last_sign_in_at
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete-user-by-email": {
        // Disabled for safety as per user request
        return new Response(JSON.stringify({ error: "Operation disabled: Hard deletes are currently turned off." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

        /*
        const { email } = params;
        if (!email) {
          return new Response(JSON.stringify({ error: "Email is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find user first
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) {
          return new Response(JSON.stringify({ error: listError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (!user) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Delete user
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

        if (deleteError) {
          return new Response(JSON.stringify({ error: deleteError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Deleted user ${user.id} (${email})`);

        return new Response(JSON.stringify({ success: true, message: `User ${email} deleted` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        */
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
