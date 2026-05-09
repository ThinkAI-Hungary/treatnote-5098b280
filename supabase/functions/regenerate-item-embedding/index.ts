import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { item_id, rule_ids_to_reactivate = [] } = await req.json();

    if (!item_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: item_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Regenerating embedding for item: ${item_id}`);

    // 1. Fetch the item
    const { data: item, error: itemError } = await supabase
      .from('clinic_treatment_items_stdl')
      .select('id, name')
      .eq('id', item_id)
      .single();

    if (itemError || !item) {
      console.error("Error fetching item:", itemError);
      return new Response(
        JSON.stringify({ success: false, error: "Item not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if (!item.name || !item.name.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Item has no valid name" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // 2. Generate embedding for the item's name
    const textsToEmbed = [item.name.trim()];
    const embeddings = await generateEmbeddings(textsToEmbed);

    if (embeddings.length === 0 || !embeddings[0]) {
      // Mark as error
      await supabase
        .from('clinic_treatment_items_stdl')
        .update({ embedding_status: 'error' })
        .eq('id', item_id);

      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate embeddings" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const embeddingVector = `[${embeddings[0].join(",")}]`;

    // 3. Save the embedding and update status via RPC
    const { error: upsertError } = await supabase.rpc('upsert_szotar_embedding_stdl', {
      p_szotar_kezeles_id: item_id,
      p_text_source: item.name.trim(),
      p_source_type: 'name',
      p_embedding: embeddingVector,
    });

    if (upsertError) {
      console.error(`Error saving embedding for "${item.name}":`, upsertError);
      
      // Mark as error
      await supabase
        .from('clinic_treatment_items_stdl')
        .update({ embedding_status: 'error' })
        .eq('id', item_id);

      return new Response(
        JSON.stringify({ success: false, error: "Failed to save embedding to database" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // 4. Reactivate rules if provided
    let reactivatedCount = 0;
    if (rule_ids_to_reactivate && Array.isArray(rule_ids_to_reactivate) && rule_ids_to_reactivate.length > 0) {
      console.log(`Reactivating ${rule_ids_to_reactivate.length} rules...`);
      const { error: reactivateError } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: true })
        .in('id', rule_ids_to_reactivate);
        
      if (reactivateError) {
        console.error("Error reactivating rules:", reactivateError);
      } else {
        reactivatedCount = rule_ids_to_reactivate.length;
      }
    }

    console.log(`Embedding regeneration complete for item ${item_id}. Reactivated ${reactivatedCount} rules.`);

    return new Response(
      JSON.stringify({
        success: true,
        item_name: item.name,
        reactivated_rules: reactivatedCount
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
