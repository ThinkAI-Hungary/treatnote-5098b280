import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 50;

// Generate embeddings using OpenAI API
async function generateEmbeddings(texts: string[], openaiApiKey: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI API error:", error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting batch embedding generation...");

    // Get BNO codes that don't have embeddings yet using a subquery approach
    // First get all bno_code_ids that already have embeddings
    const { data: existingEmbeddings, error: existingError } = await supabase
      .from("bno_embeddings")
      .select("bno_code_id");

    if (existingError) {
      console.error("Error fetching existing embeddings:", existingError);
      throw existingError;
    }

    const existingIds = new Set((existingEmbeddings || []).map(e => e.bno_code_id));
    console.log(`Found ${existingIds.size} existing embeddings`);

    // Get all BNO codes
    const { data: allCodes, error: codesError } = await supabase
      .from("bno_codes")
      .select("id, code, name")
      .order("code", { ascending: true });

    if (codesError) {
      console.error("Error fetching BNO codes:", codesError);
      throw codesError;
    }

    // Filter to only codes without embeddings and limit to batch size
    const codesToProcess = (allCodes || [])
      .filter(c => !existingIds.has(c.id))
      .slice(0, BATCH_SIZE);

    const totalRemaining = (allCodes || []).filter(c => !existingIds.has(c.id)).length;

    console.log(`Total codes: ${allCodes?.length || 0}, Remaining without embeddings: ${totalRemaining}, Processing: ${codesToProcess.length}`);

    // If no codes to process, we're done
    if (codesToProcess.length === 0) {
      console.log("All BNO codes have embeddings - job complete!");
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          remaining: 0,
          complete: true,
          message: "All BNO codes have embeddings",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate embeddings for the batch
    const texts = codesToProcess.map(c => c.name);
    console.log(`Generating embeddings for ${texts.length} codes...`);

    const embeddings = await generateEmbeddings(texts, openaiApiKey);
    console.log(`Generated ${embeddings.length} embeddings`);

    // Save each embedding using the upsert RPC
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < codesToProcess.length; i++) {
      const bnoCode = codesToProcess[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(",")}]`;

      const { error: upsertError } = await supabase.rpc("upsert_bno_embedding", {
        p_bno_code_id: bnoCode.id,
        p_text_source: bnoCode.name,
        p_source_type: "name",
        p_embedding: embeddingStr,
      });

      if (upsertError) {
        console.error(`Error saving embedding for "${bnoCode.code}":`, upsertError);
        errors.push(`${bnoCode.code}: ${upsertError.message}`);
      } else {
        processed++;
      }
    }

    const remainingAfter = totalRemaining - processed;
    console.log(`Batch complete: ${processed} processed, ${errors.length} errors, ${remainingAfter} remaining`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        remaining: remainingAfter,
        complete: remainingAfter === 0,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-bno-embeddings:", error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
