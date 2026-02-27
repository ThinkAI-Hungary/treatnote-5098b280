import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KezelesItem {
  name: string;
  category?: string;
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

// Process kezelesek in batches
async function processKezelesekWithEmbeddings(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  telephelyId: string,
  kezelesek: KezelesItem[],
  openaiApiKey: string
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  // First, upsert all kezelesek to szotar_kezelesek table
  const upsertResults: { id: string; name: string; category: string }[] = [];

  for (const kezeles of kezelesek) {
    const { data, error } = await supabase
      .from('szotar_kezelesek')
      .upsert(
        {
          telephely_id: telephelyId,
          name: kezeles.name,
          category: kezeles.category || '',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'telephely_id,name',
        }
      )
      .select('id, name, category')
      .single();

    if (error) {
      console.error(`Error upserting kezeles "${kezeles.name}":`, error);
      errors.push(`Upsert failed for "${kezeles.name}": ${error.message}`);
    } else if (data) {
      upsertResults.push(data);
    }
  }

  console.log(`Upserted ${upsertResults.length} kezelesek`);

  if (upsertResults.length === 0) {
    return { processed: 0, errors };
  }

  // Prepare texts for embedding (name embeddings only for now)
  const embeddingTasks: { id: string; text: string; sourceType: 'name' | 'category' }[] = [];

  for (const result of upsertResults) {
    embeddingTasks.push({
      id: result.id,
      text: result.name,
      sourceType: 'name',
    });
  }

  // Process in batches of 100 (OpenAI limit)
  const BATCH_SIZE = 100;

  for (let i = 0; i < embeddingTasks.length; i += BATCH_SIZE) {
    const batch = embeddingTasks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(t => t.text);

    try {
      console.log(`Generating embeddings for batch ${i / BATCH_SIZE + 1} (${texts.length} items)`);
      const embeddings = await generateEmbeddings(texts, openaiApiKey);

      // Save embeddings to database
      for (let j = 0; j < batch.length; j++) {
        const task = batch[j];
        const embedding = embeddings[j];

        // Format embedding as vector string for Postgres
        const embeddingStr = `[${embedding.join(',')}]`;

        const { error: upsertError } = await supabase.rpc('upsert_szotar_embedding', {
          p_szotar_kezeles_id: task.id,
          p_text_source: task.text,
          p_source_type: task.sourceType,
          p_embedding: embeddingStr,
        });

        if (upsertError) {
          console.error(`Error saving embedding for "${task.text}":`, upsertError);
          errors.push(`Embedding save failed for "${task.text}": ${upsertError.message}`);
        } else {
          processed++;
        }
      }
    } catch (batchError) {
      console.error(`Batch embedding error:`, batchError);
      errors.push(`Batch ${i / BATCH_SIZE + 1} failed: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
    }
  }

  return { processed, errors };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { telephely_id, user_id, content, kezelesek, regenerate } = await req.json();

    if (!telephely_id) {
      throw new Error("Missing required field: telephely_id");
    }

    // Parse content - expect an array of strings or objects (existing logic)
    let parsedContent: string[] = [];

    if (Array.isArray(content)) {
      parsedContent = content.map(item =>
        typeof item === 'string' ? item : JSON.stringify(item)
      );
    } else if (typeof content === 'object' && content !== null) {
      parsedContent = Object.values(content).map(item =>
        typeof item === 'string' ? item : JSON.stringify(item)
      );
    } else if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          parsedContent = parsed.map(item =>
            typeof item === 'string' ? item : JSON.stringify(item)
          );
        } else {
          parsedContent = [content];
        }
      } catch {
        parsedContent = [content];
      }
    }

    console.log('Parsed content:', parsedContent.length, 'items');

    // Handle szotar table update (existing logic)
    const { data: existing, error: fetchError } = await supabase
      .from('szotar')
      .select('id')
      .eq('telephely_id', telephely_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking existing szotar:', fetchError);
      throw fetchError;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('szotar')
        .update({
          content: parsedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating szotar:', updateError);
        throw updateError;
      }
      console.log('Updated existing szotar:', existing.id);
    } else {
      const { error: insertError } = await supabase
        .from('szotar')
        .insert({
          telephely_id,
          content: parsedContent,
          created_by: user_id || '00000000-0000-0000-0000-000000000000',
        });

      if (insertError) {
        console.error('Error inserting szotar:', insertError);
        throw insertError;
      }
      console.log('Created new szotar for telephely:', telephely_id);
    }

    // NEW: Handle kezelesek with embeddings
    let embeddingResult = { processed: 0, errors: [] as string[] };

    if (kezelesek && Array.isArray(kezelesek) && kezelesek.length > 0) {
      console.log(`Processing ${kezelesek.length} kezelesek with embeddings`);

      if (!openaiApiKey) {
        console.warn('OPENAI_API_KEY not configured, skipping embedding generation');
        embeddingResult.errors.push('OPENAI_API_KEY not configured');

        // Still upsert kezelesek without embeddings
        for (const kezeles of kezelesek as KezelesItem[]) {
          const { error } = await supabase
            .from('szotar_kezelesek')
            .upsert(
              {
                telephely_id,
                name: kezeles.name,
                category: kezeles.category || '',
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'telephely_id,name' }
            );

          if (error) {
            console.error(`Error upserting kezeles "${kezeles.name}":`, error);
          } else {
            embeddingResult.processed++;
          }
        }
      } else {
        embeddingResult = await processKezelesekWithEmbeddings(
          supabase,
          telephely_id,
          kezelesek as KezelesItem[],
          openaiApiKey
        );
      }

      console.log(`Embedding processing complete: ${embeddingResult.processed} processed, ${embeddingResult.errors.length} errors`);

      // Always clean up stale rows after successful upsert.
      // szotar-callback always receives the full kezelesek list for the telephely,
      // so any name not in the new set is genuinely stale and safe to delete.
      if (kezelesek.length > 0) {
        const newKeys = new Set(
          (kezelesek as KezelesItem[]).map(k => `${k.name}|||${k.category || ''}`)
        );
        console.log(`[CLEANUP] Checking for stale rows (keeping ${newKeys.size} name+category combos)...`);

        const { data: allRows, error: fetchErr } = await supabase
          .from('szotar_kezelesek')
          .select('id, name, category')
          .eq('telephely_id', telephely_id);

        if (fetchErr) {
          console.error('[CLEANUP] Error fetching existing rows:', fetchErr);
        } else if (allRows) {
          const staleIds = allRows
            .filter((row: { id: string; name: string; category: string | null }) =>
              !newKeys.has(`${row.name}|||${row.category || ''}`)
            )
            .map((row: { id: string; name: string; category: string | null }) => row.id);

          if (staleIds.length > 0) {
            console.log(`[CLEANUP] Deleting ${staleIds.length} stale rows...`);
            const { error: deleteErr } = await supabase
              .from('szotar_kezelesek')
              .delete()
              .in('id', staleIds);

            if (deleteErr) {
              console.error('[CLEANUP] Delete error:', deleteErr);
            } else {
              console.log(`[CLEANUP] Successfully deleted ${staleIds.length} stale rows`);
            }
          } else {
            console.log('[CLEANUP] No stale rows to delete');
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        items_count: parsedContent.length,
        kezelesek_processed: embeddingResult.processed,
        kezelesek_errors: embeddingResult.errors.length > 0 ? embeddingResult.errors : undefined,
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
