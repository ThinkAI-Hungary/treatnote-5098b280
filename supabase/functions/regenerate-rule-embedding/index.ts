import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmbeddingItem {
  text: string;
  source_type: string;
}

// Generate embeddings using OpenAI API
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { rule_id, mode = "flexi" } = await req.json();

    if (!rule_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: rule_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const isNative = mode === "native";
    const rulesTable = isNative ? "treatment_rules_stdl" : "treatment_rules";
    const visitsTable = isNative ? "rule_visits_stdl" : "rule_visits";
    const itemsTable = isNative ? "rule_items_stdl" : "rule_items";
    const embeddingsTable = isNative ? "treatment_embeddings_stdl" : "treatment_embeddings";
    const upsertRpc = isNative ? "upsert_treatment_embedding_stdl" : "upsert_treatment_embedding";

    console.log(`Regenerating embeddings for rule: ${rule_id} in mode: ${mode}`);

    // 1. Fetch the rule with its visits and items
    const { data: rule, error: ruleError } = await supabase
      .from(rulesTable)
      .select("id, name, semantic_description")
      .eq("id", rule_id)
      .single();

    if (ruleError || !rule) {
      console.error("Error fetching rule:", ruleError);
      return new Response(
        JSON.stringify({ success: false, error: "Rule not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // 2. Fetch all items for this rule via visits
    const { data: visits, error: visitsError } = await supabase
      .from(visitsTable)
      .select("id")
      .eq("rule_id", rule_id);

    if (visitsError) {
      console.error("Error fetching visits:", visitsError);
      return new Response(
        JSON.stringify({ success: false, error: "Error fetching rule visits" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const visitIds = visits?.map((v) => v.id) || [];
    let itemNames: string[] = [];

    if (visitIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from(itemsTable)
        .select("name")
        .in("visit_id", visitIds);

      if (itemsError) {
        console.error("Error fetching items:", itemsError);
      } else {
        itemNames = items?.map((i) => i.name).filter((n) => n && n.trim()) || [];
      }
    }

    // 3. Delete existing embeddings for this rule
    const { error: deleteError } = await supabase
      .from(embeddingsTable)
      .delete()
      .eq("treatment_rule_id", rule_id);

    if (deleteError) {
      console.error("Error deleting existing embeddings:", deleteError);
    }

    // 4. Build texts to embed
    const textsToEmbed: EmbeddingItem[] = [];

    if (rule.semantic_description && rule.semantic_description.trim()) {
      textsToEmbed.push({
        text: rule.semantic_description.trim(),
        source_type: "semantic_description",
      });
    }

    // Add unique item names
    const uniqueItemNames = [...new Set(itemNames)];
    for (const itemName of uniqueItemNames) {
      textsToEmbed.push({
        text: itemName.trim(),
        source_type: "item_name",
      });
    }

    if (textsToEmbed.length === 0) {
      console.log("No texts to embed for this rule");
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No texts to embed",
          embeddings_created: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating ${textsToEmbed.length} embeddings for rule ${rule_id}`);

    // 5. Generate embeddings
    const embeddings = await generateEmbeddings(textsToEmbed.map((t) => t.text));

    if (embeddings.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 6. Save embeddings
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < textsToEmbed.length; i++) {
      const item = textsToEmbed[i];
      const embedding = embeddings[i];

      if (!embedding) {
        failedCount++;
        continue;
      }

      const embeddingVector = `[${embedding.join(",")}]`;
      const { error: upsertError } = await supabase.rpc(upsertRpc, {
        p_treatment_rule_id: rule_id,
        p_text_source: item.text,
        p_source_type: item.source_type,
        p_embedding: embeddingVector,
      });

      if (upsertError) {
        console.error(`Error saving embedding for "${item.text}":`, upsertError);
        failedCount++;
      } else {
        successCount++;
      }
    }

    console.log(`Embedding regeneration complete: ${successCount} success, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        embeddings_created: successCount,
        embeddings_failed: failedCount,
        rule_name: rule.name,
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
