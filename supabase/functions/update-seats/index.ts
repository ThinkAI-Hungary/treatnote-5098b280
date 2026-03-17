import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_SEATS = 500;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Hiányzó bejelentkezési token. Kérjük, jelentkezzen be újra." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Érvénytelen vagy lejárt token. Kérjük, jelentkezzen be újra." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { company_id, new_seats } = await req.json();

    if (!company_id || typeof new_seats !== "number" || new_seats < 1 || new_seats > MAX_SEATS) {
      return new Response(JSON.stringify({ error: "Érvénytelen licencszám. Az értéknek 1 és 500 közé kell esnie." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify klinika_admin or admin role + company ownership
    const { data: hasKlinikaAdmin } = await serviceClient.rpc("has_role", { _user_id: userId, _role: "klinika_admin" });
    const { data: hasAdmin } = await serviceClient.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!hasKlinikaAdmin && !hasAdmin) {
      return new Response(JSON.stringify({ error: "Nincs jogosultsága a licencek kezeléséhez. Klinika Admin vagy Admin jogosultság szükséges." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await serviceClient.from("profiles").select("company_id").eq("user_id", userId).single();
    if (!profile || profile.company_id !== company_id) {
      return new Response(JSON.stringify({ error: "Nincs jogosultsága ehhez a céghez." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company subscription info
    const { data: company } = await serviceClient
      .from("companies")
      .select("stripe_subscription_item_id, subscription_status")
      .eq("id", company_id)
      .single();

    if (!company || !company.stripe_subscription_item_id || company.subscription_status !== "active") {
      return new Response(JSON.stringify({ error: "Nincs aktív Stripe előfizetés a módosításhoz." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check active member count
    const { count: memberCount } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);

    if (memberCount !== null && new_seats < memberCount) {
      return new Response(JSON.stringify({
        error: `Nem lehet a licencek számát az aktív tagok száma alá csökkenteni. Jelenleg ${memberCount} aktív tag van.`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });

    await stripe.subscriptionItems.update(company.stripe_subscription_item_id, {
      quantity: new_seats,
      proration_behavior: "create_prorations",
    });

    return new Response(JSON.stringify({ success: true, seats: new_seats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error updating seats:", err);
    return new Response(JSON.stringify({ error: "Belső hiba a licencek számának módosításakor. Kérjük, próbálja újra." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
