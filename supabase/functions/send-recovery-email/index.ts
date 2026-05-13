import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendBrevoEmail, buildPasswordResetEmail } from "../_shared/brevo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirect_url } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Az email cím megadása kötelező." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user displayName from profiles if available
    let displayName = undefined;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('email', email)
      .maybeSingle();

    if (profile?.full_name) {
      displayName = profile.full_name;
    }

    // Generate the recovery link
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirect_url || undefined,
      }
    });

    if (error) {
      console.error("Hiba a recovery link generálásakor:", error);
      // We should not reveal to the user if the email exists or not for security reasons
      // but in a trusted env or for UX we can return success anyway.
      return new Response(
        JSON.stringify({ success: true, message: "Ha létezik ez az email, kiküldtük a linket." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      throw new Error("Nem jött vissza action_link a generálásból.");
    }

    // Build the Brevo email
    const emailData = buildPasswordResetEmail({
      resetUrl: actionLink,
      displayName: displayName
    });

    // Send via Brevo
    const brevoResult = await sendBrevoEmail({
      to: { email, name: displayName },
      subject: emailData.subject,
      htmlContent: emailData.htmlContent,
      textContent: emailData.textContent,
    });

    if (!brevoResult.success) {
      console.error("Hiba a Brevo levélküldésnél:", brevoResult.error);
      return new Response(
        JSON.stringify({ error: "Nem sikerült elküldeni az emailt a levelezőrendszeren keresztül." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Váratlan hiba:", error);
    return new Response(
      JSON.stringify({ error: "Váratlan hiba történt a kérés feldolgozása során." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
