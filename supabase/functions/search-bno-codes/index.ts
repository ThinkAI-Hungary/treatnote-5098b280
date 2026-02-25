import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  query: string;
  match_count?: number;
  match_threshold?: number;
}

interface BnoResult {
  code: string;
  name: string;
  similarity: number;
}

// Generate embedding using OpenAI API
async function generateEmbedding(text: string, openaiApiKey: string): Promise<number[]> {
  console.log(`Generating embedding for query: "${text}"`);

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 1536,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI API error:", error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: SearchRequest = await req.json();
    const { query, match_count = 10, match_threshold = 0.5 } = body;

    // Validate required fields
    if (!query || typeof query !== "string" || query.trim() === "") {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: query" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Searching BNO codes for: "${query}" (threshold: ${match_threshold}, count: ${match_count})`);

    // 1. Generate embedding for the search query
    const embedding = await generateEmbedding(query.trim(), openaiApiKey);
    const embeddingStr = `[${embedding.join(",")}]`;

    // 2. Call match_bno_embedding RPC function
    const { data: matches, error: rpcError } = await supabase.rpc("match_bno_embedding", {
      query_embedding: embeddingStr,
      match_threshold: match_threshold,
      match_count: match_count,
      p_source_types: ["name"],
    });

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(
        JSON.stringify({ success: false, error: "Database search failed", details: rpcError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 3. Format results
    const results: BnoResult[] = (matches || []).map((m: any) => ({
      code: m.code,
      name: m.name,
      similarity: Math.round(m.similarity * 100) / 100, // Round to 2 decimal places
    }));

    console.log(`Found ${results.length} matching BNO codes`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
        query: query.trim(),
        count: results.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
