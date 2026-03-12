import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Publishable key is public/safe to embed — avoids stale Supabase secret issues
const LIVE_PUBLISHABLE_KEY = "pk_live_51Qs3EADG9IVOU80szgaUNBt0syctsIeBDhWqOH4hQYdvcMvc6LtFJ907TajX2g7VlFu0p53c8Q3RsiPwWZCl4dWg00CNwbQczf";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    return new Response(
        JSON.stringify({ publishable_key: LIVE_PUBLISHABLE_KEY }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
});
