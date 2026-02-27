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
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // n8n sends either JSON body or form data
        let body: Record<string, unknown>;
        const contentType = req.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            body = await req.json();
        } else {
            // n8n may wrap as array: [{ body: { ... } }]
            const raw = await req.json().catch(() => null);
            if (Array.isArray(raw) && raw.length > 0 && raw[0].body) {
                body = raw[0].body;
            } else {
                body = raw ?? {};
            }
        }

        const jobId = body.job_id as string | undefined;

        if (!jobId) {
            console.error("[treatnote-callback] Missing job_id in payload");
            return new Response(
                JSON.stringify({ error: "Missing job_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Determine outcome: n8n sends ok=1 on success, ok=0 on error
        const ok = body.ok ?? body.success ?? 1;
        const isSuccess = Number(ok) !== 0;

        if (isSuccess) {
            // Build the result object the frontend expects:
            // [{ payload: { szoveges_lista, transcriber, execution_report_human } }]
            const payload = body.payload ?? body;
            const resultData = Array.isArray(body) ? body : [{ payload }];

            const { error } = await supabaseAdmin
                .from("voice_jobs")
                .update({
                    status: "completed",
                    result: resultData,
                    completed_at: new Date().toISOString(),
                })
                .eq("id", jobId);

            if (error) {
                console.error(`[treatnote-callback] DB update error for job ${jobId}:`, error);
                return new Response(
                    JSON.stringify({ error: "DB update failed", detail: error.message }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            console.log(`[treatnote-callback] Job ${jobId} marked completed`);
            return new Response(
                JSON.stringify({ success: true, job_id: jobId }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );

        } else {
            // Error from n8n
            const errorMsg = (body.error as string) || "treatnote failed";

            const { error } = await supabaseAdmin
                .from("voice_jobs")
                .update({
                    status: "error",
                    error: errorMsg,
                    completed_at: new Date().toISOString(),
                })
                .eq("id", jobId);

            if (error) {
                console.error(`[treatnote-callback] DB error update failed for job ${jobId}:`, error);
            }

            console.log(`[treatnote-callback] Job ${jobId} marked error: ${errorMsg}`);
            return new Response(
                JSON.stringify({ success: true, job_id: jobId, status: "error" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

    } catch (err) {
        console.error("[treatnote-callback] Unexpected error:", err);
        return new Response(
            JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
