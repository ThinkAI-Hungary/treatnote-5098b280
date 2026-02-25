import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BnoCode {
  code: string;
  name: string;
}

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
      dimensions: 1536,
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

// Process embeddings in background
async function processEmbeddings(
  supabaseUrl: string,
  supabaseServiceKey: string,
  openaiApiKey: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("Starting BNO embedding generation...");

  // 1. Get all BNO codes without embeddings
  const { data: codesWithoutEmbeddings, error: fetchError } = await supabase
    .from("bno_codes")
    .select("id, code, name")
    .not("id", "in", supabase.from("bno_embeddings").select("bno_code_id"));

  if (fetchError) {
    // Fallback: get all codes and filter client-side
    console.log("Using fallback method to find codes without embeddings...");
  }

  // Get all codes
  const { data: allCodes, error: allError } = await supabase
    .from("bno_codes")
    .select("id, code, name");

  if (allError || !allCodes) {
    console.error("Error fetching BNO codes:", allError);
    return { processed: 0, errors: [allError?.message || "Failed to fetch codes"] };
  }

  // Get existing embeddings
  const { data: existingEmbeddings } = await supabase
    .from("bno_embeddings")
    .select("bno_code_id");

  const existingIds = new Set((existingEmbeddings || []).map((e) => e.bno_code_id));
  const codesToProcess = allCodes.filter((c) => !existingIds.has(c.id));

  if (codesToProcess.length === 0) {
    console.log("All BNO codes already have embeddings");
    return { processed: 0, errors: [], message: "All embeddings already exist" };
  }

  console.log(`Need to generate ${codesToProcess.length} embeddings`);

  // Process in batches of 100
  const BATCH_SIZE = 100;
  let processed = 0;
  const errors: string[] = [];

  for (let i = 0; i < codesToProcess.length; i += BATCH_SIZE) {
    const batch = codesToProcess.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.name);

    try {
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${texts.length} items)`);
      const embeddings = await generateEmbeddings(texts, openaiApiKey);

      // Save each embedding
      for (let j = 0; j < batch.length; j++) {
        const bnoCode = batch[j];
        const embedding = embeddings[j];
        const embeddingStr = `[${embedding.join(",")}]`;

        const { error: upsertError } = await supabase.rpc("upsert_bno_embedding", {
          p_bno_code_id: bnoCode.id,
          p_text_source: bnoCode.name,
          p_source_type: "name",
          p_embedding: embeddingStr,
        });

        if (upsertError) {
          console.error(`Error saving embedding for "${bnoCode.code}":`, upsertError);
          errors.push(`Failed: ${bnoCode.code}`);
        } else {
          processed++;
        }
      }
    } catch (batchError) {
      console.error(`Batch error:`, batchError);
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed`);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`Embedding generation complete: ${processed} processed, ${errors.length} errors`);
  return { processed, errors };
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, codes } = await req.json();

    if (action === "import" && codes) {
      // Bulk import BNO codes
      console.log(`Importing ${codes.length} BNO codes...`);

      // Insert in batches of 500
      const BATCH_SIZE = 500;
      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < codes.length; i += BATCH_SIZE) {
        const batch = codes.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from("bno_codes")
          .upsert(
            batch.map((c: BnoCode) => ({
              code: c.code,
              name: c.name,
            })),
            { onConflict: "code", ignoreDuplicates: true }
          )
          .select();

        if (error) {
          console.error(`Batch insert error:`, error);
        } else {
          inserted += data?.length || 0;
        }
      }

      console.log(`Import complete: ${inserted} inserted`);

      return new Response(
        JSON.stringify({
          success: true,
          inserted,
          total: codes.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "generate-embeddings") {
      if (!openaiApiKey) {
        return new Response(
          JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      // Process embeddings in background
      // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
      EdgeRuntime.waitUntil(
        processEmbeddings(supabaseUrl, supabaseServiceKey, openaiApiKey)
          .then((result) => {
            console.log("Background embedding generation completed:", result);
          })
          .catch((err) => {
            console.error("Background embedding generation failed:", err);
          })
      );

      // Return immediate response
      return new Response(
        JSON.stringify({
          success: true,
          message: "Embedding generation started in background",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      // Get counts
      const { count: codesCount } = await supabase
        .from("bno_codes")
        .select("*", { count: "exact", head: true });

      const { count: embeddingsCount } = await supabase
        .from("bno_embeddings")
        .select("*", { count: "exact", head: true });

      return new Response(
        JSON.stringify({
          success: true,
          codes_count: codesCount || 0,
          embeddings_count: embeddingsCount || 0,
          embeddings_percentage:
            codesCount && codesCount > 0
              ? Math.round(((embeddingsCount || 0) / codesCount) * 100)
              : 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use: import, generate-embeddings, or status" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
