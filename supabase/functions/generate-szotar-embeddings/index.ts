import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SzotarKezeles {
  id: string;
  name: string;
  category: string;
}

// Generate embeddings using OpenAI API
async function generateEmbeddings(texts: string[], openaiApiKey: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-large',
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

// Process embeddings in background
async function processEmbeddings(
  supabaseUrl: string,
  supabaseServiceKey: string,
  openaiApiKey: string,
  telephelyId: string,
  mode: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`Starting embedding generation for telephely: ${telephelyId} in mode: ${mode}`);

  const isNative = mode === "native";
  const kezelesekTable = isNative ? 'clinic_treatment_items_stdl' : 'szotar_kezelesek';
  const embeddingsTable = isNative ? 'szotar_embeddings_stdl' : 'szotar_embeddings';
  const upsertRpc = isNative ? 'upsert_szotar_embedding_stdl' : 'upsert_szotar_embedding';

  // 1. Get all kezelesek for this telephely
  const { data: kezelesek, error: fetchError } = await supabase
    .from(kezelesekTable)
    .select('id, name, category')
    .eq('telephely_id', telephelyId);

  if (fetchError) {
    console.error('Error fetching szotar_kezelesek:', fetchError);
    return { processed: 0, errors: [fetchError.message] };
  }

  if (!kezelesek || kezelesek.length === 0) {
    console.log('No szotar_kezelesek found for this telephely');
    return { processed: 0, errors: [] };
  }

  console.log(`Found ${kezelesek.length} szotar_kezelesek records`);

  // 2. Get existing embeddings - fetch all for this telephely via join instead of IN clause
  // This avoids URL length limits with many UUIDs
  const { data: existingEmbeddings, error: embeddingsError } = await supabase
    .from(embeddingsTable)
    .select(`szotar_kezeles_id, source_type, ${kezelesekTable}!inner(telephely_id)`)
    .eq(`${kezelesekTable}.telephely_id`, telephelyId);

  if (embeddingsError) {
    console.error('Error fetching existing embeddings:', embeddingsError);
    // Continue anyway - we'll just regenerate all embeddings
  }

  // Create a set of existing embedding keys (id + source_type)
  const existingKeys = new Set(
    (existingEmbeddings || []).map(e => `${e.szotar_kezeles_id}_${e.source_type}`)
  );

  console.log(`Found ${existingKeys.size} existing embeddings`);

  // 3. Build list of embeddings to generate
  interface EmbeddingTask {
    id: string;
    text: string;
    sourceType: 'name';
  }

  const tasksToProcess: EmbeddingTask[] = [];

  for (const kezeles of kezelesek as SzotarKezeles[]) {
    // Check if name embedding exists
    if (!existingKeys.has(`${kezeles.id}_name`)) {
      tasksToProcess.push({
        id: kezeles.id,
        text: kezeles.name,
        sourceType: 'name',
      });
    }
  }

  if (tasksToProcess.length === 0) {
    console.log('All embeddings already exist');
    return { processed: 0, errors: [], message: 'All embeddings already exist' };
  }

  console.log(`Need to generate ${tasksToProcess.length} embeddings`);

  // 4. Process in batches of 100
  const BATCH_SIZE = 100;
  let processed = 0;
  const errors: string[] = [];

  for (let i = 0; i < tasksToProcess.length; i += BATCH_SIZE) {
    const batch = tasksToProcess.slice(i, i + BATCH_SIZE);
    const texts = batch.map(t => t.text);

    try {
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${texts.length} items)`);
      const embeddings = await generateEmbeddings(texts, openaiApiKey);

      // Save each embedding
      for (let j = 0; j < batch.length; j++) {
        const task = batch[j];
        const embedding = embeddings[j];
        const embeddingStr = `[${embedding.join(',')}]`;

        const { error: upsertError } = await supabase.rpc(upsertRpc, {
          p_szotar_kezeles_id: task.id,
          p_text_source: task.text,
          p_source_type: task.sourceType,
          p_embedding: embeddingStr,
        });

        if (upsertError) {
          console.error(`Error saving embedding for "${task.text}":`, upsertError);
          errors.push(`Failed to save embedding for "${task.text}": ${upsertError.message}`);
        } else {
          processed++;
        }
      }
    } catch (batchError) {
      console.error(`Batch error:`, batchError);
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
    }
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

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const { telephely_id, mode = "flexi" } = await req.json();

    if (!telephely_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: telephely_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log(`Received request to generate embeddings for telephely: ${telephely_id}`);

    // Process embeddings in background
    // @ts-ignore: EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(
      processEmbeddings(supabaseUrl, supabaseServiceKey, openaiApiKey, telephely_id, mode)
        .then(result => {
          console.log('Background embedding generation completed:', result);
        })
        .catch(err => {
          console.error('Background embedding generation failed:', err);
        })
    );

    // Return immediate response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Embedding generation started in background",
        telephely_id 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
