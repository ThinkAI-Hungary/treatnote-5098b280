import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logErrorToDatabase } from "../_shared/logger.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

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

/**
 * Find the right slug for a new company registration.
 *
 * Rules:
 *  - A company is "active" if it has at least one profile (user) associated.
 *  - Ghost companies (no profiles) are **deleted** so their slugs can be reused.
 *  - If the base slug has no active company → use it directly (no suffix).
 *  - If it does, find the lowest integer >= 2 that is not used by an active company.
 *
 * Example: active slugs are "foo", "foo-2", "foo-5"
 *   → next slug is "foo-3" (lowest gap)
 */
async function findAvailableSlug(
    supabase: ReturnType<typeof createClient>,
    baseSlug: string
): Promise<string> {
    // 1. Fetch all companies whose slug is exactly baseSlug or matches baseSlug-<number>
    const { data: candidates } = await supabase
        .from("companies")
        .select("id, slug")
        .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);

    if (!candidates || candidates.length === 0) {
        return baseSlug; // nothing exists → plain slug is free
    }

    // 2. For each candidate, check if it has at least one profile
    const activeNumbers = new Set<number>();
    let baseActive = false;
    const ghostIds: string[] = [];

    for (const co of candidates) {
        const { count } = await supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .eq("company_id", co.id);

        const hasUsers = (count ?? 0) > 0;

        if (hasUsers) {
            if (co.slug === baseSlug) {
                baseActive = true;
            } else {
                // Extract the numeric suffix, e.g. "zombori.mark-3" → 3
                const m = co.slug.match(/-(\d+)$/);
                if (m) activeNumbers.add(parseInt(m[1], 10));
            }
        } else {
            // No profiles → ghost company, mark for cleanup
            ghostIds.push(co.id);
        }
    }

    // 3. Delete ghost companies (they have no users – safe to remove so slugs are freed)
    if (ghostIds.length > 0) {
        // Also delete any orphaned telephely/licenses that belong to ghost companies
        await supabase.from("telephely").delete().in("company_id", ghostIds);
        await supabase.from("licenses").delete().in("company_id", ghostIds);
        await supabase.from("companies").delete().in("id", ghostIds);
    }

    // 4. Determine the slug to use
    if (!baseActive) {
        return baseSlug; // base slug is free (ghost was cleaned up)
    }

    // Find lowest available suffix >= 2
    let n = 2;
    while (activeNumbers.has(n)) n++;
    return `${baseSlug}-${n}`;
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

        const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ── Rate Limiting ─────────────────────────────────────────────────────
        const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown-ip";
        // 3 requests per 60 minutes based on IP
        const rateLimitResult = await checkRateLimit(supabaseAdmin, clientIp, 'solo-register', 3, 60);

        if (!rateLimitResult.allowed) {
            return new Response(JSON.stringify({ error: "Túl sok regisztrációs kísérlet ugyanarról az IP címről. Kérjük, próbálja újra később." }), {
                status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const origin = req.headers.get("origin") || "";
        // Use APP_URL secret if set; otherwise use request origin explicitly
        const appUrl = Deno.env.get("APP_URL") || (origin ? origin : null);

        const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({
            email, password,
            options: {
                data: { full_name: displayName, solo_registration: true },
                ...(appUrl && { emailRedirectTo: `${appUrl}/auth` }),
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
            return new Response(
                JSON.stringify({ error: "Ez az email cím már regisztrálva van" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        // ── Derive a unique slug (smart: reuses gaps, cleans ghost companies) ───
        const baseSlug = slugify(email.split("@")[0]);
        const slug = await findAvailableSlug(supabaseAdmin, baseSlug);
        const companyName = slug;

        // ── Create company ──────────────────────────────────────────────────────
        const { data: company, error: companyError } = await supabaseAdmin
            .from("companies")
            .insert({ name: companyName, slug, is_solo: true })
            .select("id")
            .single();

        if (companyError) {
            console.error("Company creation error:", companyError);
            await logErrorToDatabase(supabaseAdmin, {
                script_name: 'solo-register',
                summary: 'Cég létrehozási hiba',
                full_log: companyError,
                user_id: userId,
            });
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
            await logErrorToDatabase(supabaseAdmin, {
                script_name: 'solo-register',
                summary: 'Telephely létrehozási hiba',
                full_log: telephelyError,
                user_id: userId,
                company_id: company.id,
            });
            await supabaseAdmin.auth.admin.deleteUser(userId);
            await supabaseAdmin.from("companies").delete().eq("id", company.id);
            return new Response(JSON.stringify({ error: "Hiba a telephely létrehozásakor" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── Pre-create the profile ──────────────────────────────────────────────
        const profilePayload = {
            user_id: userId,
            full_name: displayName,
            company_id: company.id,
            telephely_id: telephely.id,
            current_telephely_id: telephely.id,
            is_solo: true,
        };

        const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .upsert(profilePayload, { onConflict: "user_id" });

        if (profileError) {
            console.error("Profile upsert error:", profileError);
            await logErrorToDatabase(supabaseAdmin, {
                script_name: 'solo-register',
                summary: 'Profil mentési hiba',
                full_log: profileError,
                user_id: userId,
                company_id: company.id,
                telephely_id: telephely.id,
            });
        }

        // ── Set role: klinika_admin via telephely_memberships ──────────────────
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);

        const { error: membershipError } = await supabaseAdmin
            .from("telephely_memberships")
            .upsert(
                { user_id: userId, telephely_id: telephely.id, role: "klinika_admin" },
                { onConflict: "user_id,telephely_id" }
            );

        if (membershipError) {
            console.error("Membership error:", membershipError);
            await logErrorToDatabase(supabaseAdmin, {
                script_name: 'solo-register',
                summary: 'Jogosultság beállítási hiba',
                full_log: membershipError,
                user_id: userId,
                company_id: company.id,
                telephely_id: telephely.id,
            });
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
            await logErrorToDatabase(supabaseAdmin, {
                script_name: 'solo-register',
                summary: 'Licenc létrehozási hiba',
                full_log: licenseError,
                user_id: userId,
                company_id: company.id,
                telephely_id: telephely.id,
            });
        }

        await supabaseAdmin
            .from("profiles")
            .update({ full_name: displayName })
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
