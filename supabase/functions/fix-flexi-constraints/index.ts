import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Use Supabase's internal postgres connection string (available in Edge Functions)
        const dbUrl = Deno.env.get("SUPABASE_DB_URL");
        if (!dbUrl) {
            return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not available" }), {
                status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Import postgres library
        const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
        const sql = postgres(dbUrl, { max: 1 });

        const results: string[] = [];

        try {
            // Step 1: Drop global flexi_username unique constraint
            await sql`ALTER TABLE public.flexi_auth DROP CONSTRAINT IF EXISTS flexi_auth_flexi_username_unique`;
            results.push("Step 1: OK - dropped flexi_auth_flexi_username_unique");
        } catch (e) {
            results.push(`Step 1 error: ${e}`);
        }

        try {
            // Step 2: Drop original user_id unique constraint
            await sql`ALTER TABLE public.flexi_auth DROP CONSTRAINT IF EXISTS flexi_auth_user_id_key`;
            results.push("Step 2: OK - dropped flexi_auth_user_id_key");
        } catch (e) {
            results.push(`Step 2 error: ${e}`);
        }

        try {
            // Step 3: Delete legacy rows with NULL telephely_id
            const deleted = await sql`DELETE FROM public.flexi_auth WHERE telephely_id IS NULL RETURNING id`;
            results.push(`Step 3: OK - deleted ${deleted.length} legacy NULL-telephely rows`);
        } catch (e) {
            results.push(`Step 3 error: ${e}`);
        }

        try {
            // Step 4: Ensure correct composite unique constraint exists
            await sql`ALTER TABLE public.flexi_auth DROP CONSTRAINT IF EXISTS flexi_auth_user_telephely_key`;
            await sql`ALTER TABLE public.flexi_auth ADD CONSTRAINT flexi_auth_user_telephely_key UNIQUE (user_id, telephely_id)`;
            results.push("Step 4: OK - UNIQUE(user_id, telephely_id) constraint ensured");
        } catch (e) {
            results.push(`Step 4 error: ${e}`);
        }

        await sql.end();

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
