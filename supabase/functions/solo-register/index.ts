import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(emailPrefix: string): string {
    return emailPrefix
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .substring(0, 50);
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        const { email, password, full_name } = await req.json();

        // ── Validation ─────────────────────────────────────────────────────────
        if (!email || !password) {
            return new Response(JSON.stringify({ error: "Email és jelszó megadása kötelező" }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        if (password.length < 6) {
            return new Response(JSON.stringify({ error: "A jelszónak legalább 6 karakter hosszúnak kell lennie" }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const displayName = full_name?.trim() || email.split("@")[0];

        // ── Use signUp() so Supabase sends the confirmation email ───────────────
        // We use the anon client for signup (this triggers the confirmation email),
        // but we pass the service role key via a separate admin client for DB ops.
        const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const origin = req.headers.get("origin") || "https://bpjzgapmoyhtgryglcke.supabase.co";
        const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: displayName, solo_registration: true },
                emailRedirectTo: `${origin}/dashboard`,
            },
        });

        if (signUpError) {
            const msg = signUpError.message.toLowerCase();
            const alreadyExists = msg.includes("already registered")
                || msg.includes("database error saving new user")
                || msg.includes("user already registered");
            return new Response(
                JSON.stringify({ error: alreadyExists ? "Ez az email cím már regisztrálva van. Kérjük, jelentkezzen be!" : signUpError.message }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        const userId = signUpData.user?.id;
        if (!userId) {
            // Supabase returns user=null when email already exists (no error thrown)
            return new Response(
                JSON.stringify({ error: "Ez az email cím már regisztrálva van" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        // ── Derive a unique slug from the email prefix ──────────────────────────
        const baseSlug = slugify(email.split("@")[0]);
        let slug = baseSlug;
        let suffix = 2;
        while (true) {
            const { data: existing } = await supabaseAdmin
                .from("companies")
                .select("id")
                .eq("slug", slug)
                .maybeSingle();
            if (!existing) break;
            slug = `${baseSlug}-${suffix++}`;
        }
        const companyName = slug;

        // ── Create company ──────────────────────────────────────────────────────
        const { data: company, error: companyError } = await supabaseAdmin
            .from("companies")
            .insert({ name: companyName, slug })
            .select("id")
            .single();

        if (companyError) {
            console.error("Company creation error:", companyError);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return new Response(JSON.stringify({ error: "Hiba a cég létrehozásakor" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── Create telephely ────────────────────────────────────────────────────
        const { data: telephely, error: telephelyError } = await supabaseAdmin
            .from("telephely")
            .insert({ name: companyName, company_id: company.id })
            .select("id")
            .single();

        if (telephelyError) {
            console.error("Telephely creation error:", telephelyError);
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabaseAdmin.from("companies").delete().eq("id", company.id);
            return new Response(JSON.stringify({ error: "Hiba a telephely létrehozásakor" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── Pre-create the profile (trigger will hit ON CONFLICT DO NOTHING) ───
        // If the user confirms email later, the trigger's INSERT hits the conflict
        // clause and skips — so our profile with company/telephely stays intact.
        const profilePayload = {
            user_id: userId,
            full_name: displayName,
            company_id: company.id,
            telephely_id: telephely.id,
            current_telephely_id: telephely.id,
        };

        // The trigger may have already run synchronously (if Supabase internally
        // confirms during signUp), so use upsert (ON CONFLICT update).
        const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert(profilePayload, { onConflict: "user_id" });

        if (profileError) {
            console.error("Profile upsert error:", profileError);
        }

        // ── Set role: klinika_admin via telephely_memberships ──────────────────
        // The trigger may have already inserted user_roles('user'). Remove it.
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

        const { error: membershipError } = await supabaseAdmin
            .from("telephely_memberships")
            .upsert(
                { user_id: userId, telephely_id: telephely.id, role: "klinika_admin" },
                { onConflict: "user_id,telephely_id" }
            );

        if (membershipError) {
            console.error("Membership error:", membershipError);
        }

        // ── Grant a 14-day trial license ────────────────────────────────────────
        const trialExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const { error: licenseError } = await supabaseAdmin
            .from("licenses")
            .insert({
                company_id: company.id,
                assigned_user_id: userId,
                telephely_id: telephely.id,
                status: "assigned",
                license_type: "trial",
                billing_interval: "monthly",
                expires_at: trialExpiry,
            });

        if (licenseError) {
            console.error("Trial license creation error:", licenseError);
            // Non-fatal — user is still registered
        }

        // ── Store registration intent so confirmation webhook can clean up ──────

        // (If you later add a webhook on email confirmation, you can re-read this.)
        await supabaseAdmin
            .from("profiles")
            .update({ full_name: displayName }) // trigger the sync_company_name as well
            .eq("user_id", userId);

        console.log(`Solo registration: ${email} → company "${companyName}" | awaiting email confirmation`);

        return new Response(
            JSON.stringify({ success: true, emailConfirmationRequired: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err) {
        console.error("solo-register error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Ismeretlen hiba" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
