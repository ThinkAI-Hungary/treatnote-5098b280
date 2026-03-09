import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs/mod.js";

serve(async (_req) => {
    const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
    try {
        const rows = await sql`
      SELECT
        challenge_text,
        grid_size,
        ai_final_tiles,
        human_tiles,
        ai_error_analysis,
        analysis_done_at
      FROM captcha_vector
      WHERE ai_error_analysis IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `;
        return new Response(JSON.stringify({ success: true, rows }), {
            headers: { "Content-Type": "application/json" }
        });
    } catch (e) {
        return new Response(JSON.stringify({ success: false, error: String(e) }), {
            status: 500, headers: { "Content-Type": "application/json" }
        });
    } finally {
        await sql.end();
    }
});
