import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Generate UUID v4
function generateUUID(): string {
  return crypto.randomUUID();
}

// Helper: HMAC-SHA256 signing
async function signPayload(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Sleep for retry backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Sanitize name for storage (ASCII, underscores)
function sanitizeSlug(name: string): string {
  const diacriticMap: Record<string, string> = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o', 'ú': 'u', 'ü': 'u', 'ű': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ö': 'O', 'Ő': 'O', 'Ú': 'U', 'Ü': 'U', 'Ű': 'U',
  };
  return name
    .split('')
    .map(char => diacriticMap[char] || char)
    .join('')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
    .replace(/_+/g, '_');
}

// ==========================================================
// Embedding generálás OpenAI API-val
// ==========================================================
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!texts || texts.length === 0) return [];

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    console.error('Missing OPENAI_API_KEY secret');
    return [];
  }

  try {
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
      console.error(`OpenAI API error: ${response.status} - ${error}`);
      return [];
    }

    const data = await response.json();
    return data.data.map((d: { embedding: number[] }) => d.embedding);
  } catch (error) {
    console.error('Embedding generation error:', error);
    return [];
  }
}

// ==========================================================
// Embedding mentése Supabase-be (semantic_description + item_names)
// ==========================================================
interface EmbeddingItem {
  text: string;
  source_type: 'semantic_description' | 'item_name';
}

// deno-lint-ignore no-explicit-any
async function saveEmbeddings(
  supabase: any,
  ruleId: string,
  semanticDescription: string | null,
  itemNames: string[]
): Promise<{ success: number; failed: number }> {
  const stats = { success: 0, failed: 0 };
  const textsToEmbed: EmbeddingItem[] = [];

  // Semantic description embedding
  if (semanticDescription && semanticDescription.trim()) {
    textsToEmbed.push({
      text: semanticDescription.trim(),
      source_type: 'semantic_description',
    });
  }

  // Item name embeddings (unique names only)
  const uniqueItemNames = [...new Set(itemNames.filter(name => name && name.trim()))];
  for (const itemName of uniqueItemNames) {
    textsToEmbed.push({
      text: itemName.trim(),
      source_type: 'item_name',
    });
  }

  if (textsToEmbed.length === 0) {
    console.log(`No texts to embed for rule ${ruleId}`);
    return stats;
  }

  console.log(`Generating ${textsToEmbed.length} embeddings for rule ${ruleId}`);

  // Embedding generálás batch-ben
  const embeddings = await generateEmbeddings(textsToEmbed.map(t => t.text));

  if (embeddings.length === 0) {
    console.error(`Failed to generate embeddings for rule ${ruleId}`);
    stats.failed = textsToEmbed.length;
    return stats;
  }

  // Mentés Supabase-be
  for (let i = 0; i < textsToEmbed.length; i++) {
    const item = textsToEmbed[i];
    const embedding = embeddings[i];

    if (!embedding) {
      console.error(`Missing embedding for index ${i}`);
      stats.failed++;
      continue;
    }

    const embeddingVector = `[${embedding.join(',')}]`;
    const { error } = await supabase
      .from('treatment_embeddings')
      .upsert({
        treatment_rule_id: ruleId,
        text_source: item.text,
        source_type: item.source_type,
        embedding: embeddingVector,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'treatment_rule_id,text_source,source_type',
      });

    if (error) {
      console.error(`Failed to save ${item.source_type} embedding: ${error.message}`);
      stats.failed++;
    } else {
      stats.success++;
    }
  }

  console.log(`Embeddings for rule ${ruleId}: ${stats.success} success, ${stats.failed} failed`);
  return stats;
}

interface SzotarKezelesItem {
  id: string;
  name: string;
  category: string;
}

interface SzotarData {
  content: unknown | null;
  kezelesek: SzotarKezelesItem[];
}

interface WebhookPayload {
  version: string;
  event_id: string;
  file_name: string;
  file_slug: string;
  file_content_base64: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  telephely_id: string;
  telephely_name: string;
  telephely_slug: string;
  flexi_domain: string | null;
  uploaded_by: string | null;
  szotar: SzotarData | null;
  timestamp: string;
}

interface SuccessResponse {
  ok: true;
  status: 'sent' | 'processed';
  event_id: string;
  inserted?: number;
  duplicates?: number;
  embeddings?: {
    success: number;
    failed: number;
  };
}

interface VisitItem {
  name: string;
  qty: number;
  unit: string;
  target_tooth_type?: string;
  scaling?: string;
}

interface ParsedVisit {
  visit_no: number;
  duration_days?: number;
  healing_time_months?: number;
  items: VisitItem[];
}

interface ExtractionItem {
  fogalom: string;
  kategoria?: string;
  semantic_description?: string;
  file_name?: string;
  parsed?: {
    visits?: ParsedVisit[];
  };
}

interface ErrorResponse {
  ok: false;
  status: 'error';
  code: string;
  message: string;
  event_id: string;
}

// Helper: Map target_tooth_type to valid enum value
function mapTargetToothType(value?: string): 'all' | 'pillar_only' | 'pontic_only' {
  if (value === 'pillar_only' || value === 'pontic_only') {
    return value;
  }
  return 'all';
}

// Helper: Map scaling to valid enum value
function mapScaling(value?: string): 'per_tooth' | 'per_case' | 'fix' {
  if (value === 'per_case' || value === 'fix') {
    return value;
  }
  return 'per_tooth';
}

// Retry delays in milliseconds: 30s, 60s, 90s
const RETRY_DELAYS = [30000, 60000, 90000];
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries

// Helper to update job status in rule_generation_jobs
// deno-lint-ignore no-explicit-any
async function updateJobStatus(
  supabase: any,
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString(), ...extra };
  if (status === 'completed' || status === 'error') {
    update.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('rule_generation_jobs')
    .update(update)
    .eq('id', jobId);
  if (error) {
    console.error(`Failed to update job ${jobId}:`, error.message);
  }
}

// Background processing function for PDF upload with auto-retry
// deno-lint-ignore no-explicit-any
async function processPdfInBackground(
  supabase: any,
  jobId: string,
  webhookUrl: string,
  secondaryWebhookUrl: string,
  hmacSecret: string,
  payloadString: string,
  hexDigest: string,
  telephely_id: string,
  eventId: string
): Promise<void> {
  console.log(`[Background ${eventId}] Starting PDF webhook processing (job: ${jobId})...`);

  try {
    // Helper: call a single webhook URL once
    async function callWebhookOnce(url: string, urlName: string): Promise<{ success: boolean; responseData?: Record<string, unknown>; error?: string }> {
      try {
        console.log(`[${urlName}] Sending to ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': `sha256=${hexDigest}`,
          },
          body: payloadString,
        });

        const responseText = await response.text();
        console.log(`[${urlName}] Response status: ${response.status}, body: ${responseText.substring(0, 500)}`);

        if (response.status === 404 && responseText.includes('not registered')) {
          return { success: false, error: 'Webhook not registered' };
        }

        if (response.ok) {
          let responseData: Record<string, unknown> = {};
          try { responseData = JSON.parse(responseText); } catch { /* ok */ }
          if (responseData.status === 'error' || responseData.error) {
            return { success: false, error: (responseData.message as string) || (responseData.error as string) || 'Unknown n8n error' };
          }
          return { success: true, responseData };
        } else {
          return { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 200)}` };
        }
      } catch (networkError) {
        return { success: false, error: networkError instanceof Error ? networkError.message : String(networkError) };
      }
    }

    // Auto-retry loop: attempt 1 + 3 retries (30s, 60s, 90s delays)
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`[Background ${eventId}] Attempt ${attempt}/${MAX_ATTEMPTS}`);
      await updateJobStatus(supabase, jobId, 'processing', { attempt });

      // Try primary, then secondary
      const primaryResult = await callWebhookOnce(webhookUrl, 'PRIMARY');
      let successfulResult = primaryResult;

      if (!primaryResult.success) {
        console.log(`[Background ${eventId}] Primary failed (${primaryResult.error}), trying secondary...`);
        const secondaryResult = await callWebhookOnce(secondaryWebhookUrl, 'SECONDARY');
        if (secondaryResult.success) {
          successfulResult = secondaryResult;
        }
      }

      if (successfulResult.success && successfulResult.responseData) {
        // Extract data from n8n response
        const extractionsData = successfulResult.responseData.extractions
          || (successfulResult.responseData.body as Record<string, unknown>)?.extractions;

        if (extractionsData && Array.isArray(extractionsData)) {
          console.log(`[Background ${eventId}] Got ${extractionsData.length} extractions, inserting into DB...`);

          const extractions = extractionsData as ExtractionItem[];
          let insertedCount = 0;
          let duplicateCount = 0;
          const embeddingStats = { success: 0, failed: 0 };

          for (const extraction of extractions) {
            if (!extraction.fogalom) {
              console.log('Skipping extraction without fogalom');
              continue;
            }

            const { data: ruleData, error: ruleError } = await supabase
              .from('treatment_rules')
              .insert({
                clinic_id: telephely_id,
                name: extraction.fogalom,
                category: extraction.kategoria || null,
                semantic_description: extraction.semantic_description || null,
                alapszabaly: false,
              })
              .select('id')
              .single();

            if (ruleError) {
              if (ruleError.code === '23505') {
                console.log(`Duplicate: ${extraction.fogalom}`);
                duplicateCount++;
                continue;
              } else {
                console.error('Rule insert error:', ruleError);
                continue;
              }
            }

            const visits = extraction.parsed?.visits || [];
            const allItemNames: string[] = [];

            for (let vi = 0; vi < visits.length; vi++) {
              const visit = visits[vi];
              const { data: visitData, error: visitError } = await supabase
                .from('rule_visits')
                .insert({
                  rule_id: ruleData.id,
                  visit_number: visit.visit_no || vi + 1,
                  duration_days: visit.duration_days || 0,
                  healing_months: visit.healing_time_months || 0,
                  display_order: vi,
                })
                .select('id')
                .single();

              if (visitError) { console.error('Visit insert error:', visitError); continue; }

              if (visit.items && visit.items.length > 0) {
                const itemsToInsert = visit.items.map((item, ii) => ({
                  visit_id: visitData.id,
                  name: item.name || '',
                  quantity: item.qty || 1,
                  unit: item.unit || 'db',
                  scaling: mapScaling(item.scaling),
                  target_tooth_type: mapTargetToothType(item.target_tooth_type),
                  display_order: ii,
                }));
                for (const item of visit.items) { if (item.name) allItemNames.push(item.name); }
                const { error: itemsError } = await supabase.from('rule_items').insert(itemsToInsert);
                if (itemsError) console.error('Items insert error:', itemsError);
              }
            }

            // Embedding generation
            const ruleEmbeddingStats = await saveEmbeddings(supabase, ruleData.id, extraction.semantic_description || null, allItemNames);
            embeddingStats.success += ruleEmbeddingStats.success;
            embeddingStats.failed += ruleEmbeddingStats.failed;
            insertedCount++;
          }

          console.log(`[Background ${eventId}] Complete: ${insertedCount} inserted, ${duplicateCount} duplicates`);
          console.log(`[Background ${eventId}] Embeddings: ${embeddingStats.success} success, ${embeddingStats.failed} failed`);

          await updateJobStatus(supabase, jobId, 'completed', { extractions_count: insertedCount });
          return; // Success — exit retry loop
        }

        // Webhook succeeded but no extractions
        console.log(`[Background ${eventId}] Webhook succeeded but no extractions in response`);
        await updateJobStatus(supabase, jobId, 'completed', { extractions_count: 0 });
        return;
      }

      // This attempt failed — mark error and wait before retry
      const errorMsg = successfulResult.error || 'Unknown error';
      console.error(`[Background ${eventId}] Attempt ${attempt} failed: ${errorMsg}`);
      await updateJobStatus(supabase, jobId, 'error', { error_message: errorMsg, attempt });

      if (attempt < MAX_ATTEMPTS) {
        const delay = RETRY_DELAYS[attempt - 1];
        console.log(`[Background ${eventId}] Waiting ${delay / 1000}s before retry ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.error(`[Background ${eventId}] All ${MAX_ATTEMPTS} attempts exhausted`);

  } catch (fatalError) {
    console.error(`[Background ${eventId}] Fatal error:`, fatalError);
    await updateJobStatus(supabase, jobId, 'error', {
      error_message: `Fatal: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`,
    });
  }
}

// Declare EdgeRuntime for Deno
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const eventId = generateUUID();
  const batchId = generateUUID();

  try {
    // Get secrets
    const webhookUrl = Deno.env.get('N8N_SZABALYEPITO_TESZT_WEBHOOK_URL');
    const hmacSecret = Deno.env.get('N8N_SZABALYEPITO_TESZT_HMAC_SECRET');
    const secondaryWebhookUrl = 'https://n8n.thinkaimedical.hu/webhook-test/7dc774fc-90bb-4f50-bac2-0f18b0d13ed4';

    if (!webhookUrl || !hmacSecret) {
      console.error('Missing required secrets');
      return new Response(JSON.stringify({
        ok: false, status: 'error', code: 'CONFIG_ERROR',
        message: 'Webhook configuration missing', event_id: eventId,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Parse request body
    const body = await req.json();
    const { file_name, file_content_base64, company_id, company_name, telephely_id, telephely_name, uploaded_by } = body;

    if (!file_name || !file_content_base64 || !company_id || !company_name || !telephely_id || !telephely_name) {
      return new Response(JSON.stringify({
        ok: false, status: 'error', code: 'VALIDATION_ERROR',
        message: 'Missing required fields', event_id: eventId,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate slugs
    const companySlug = sanitizeSlug(company_name);
    const telephelySlug = sanitizeSlug(telephely_name);
    const fileSlug = sanitizeSlug(file_name.replace(/\.pdf$/i, ''));

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({
        ok: false, status: 'error', code: 'CONFIG_ERROR',
        message: 'Supabase configuration missing', event_id: eventId,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch telephely data
    let flexiDomain: string | null = null;
    let szotarData: SzotarData | null = null;

    const { data: telephelyData } = await supabase
      .from('telephely').select('flexi_domain').eq('id', telephely_id).maybeSingle();
    if (telephelyData) flexiDomain = telephelyData.flexi_domain || null;

    const { data: szotarRecord } = await supabase
      .from('szotar').select('content').eq('telephely_id', telephely_id).maybeSingle();
    const { data: kezelesekRecords } = await supabase
      .from('szotar_kezelesek').select('id, name, category').eq('telephely_id', telephely_id);
    szotarData = { content: szotarRecord?.content || null, kezelesek: (kezelesekRecords as SzotarKezelesItem[]) || [] };

    // Build webhook payload
    const payload: WebhookPayload = {
      version: '1.0', event_id: eventId, file_name, file_slug: fileSlug,
      file_content_base64, company_id, company_name, company_slug: companySlug,
      telephely_id, telephely_name, telephely_slug: telephelySlug,
      flexi_domain: flexiDomain, uploaded_by: uploaded_by || null,
      szotar: szotarData, timestamp: new Date().toISOString(),
    };

    const payloadString = JSON.stringify(payload);
    const hexDigest = await signPayload(hmacSecret, payloadString);

    // Insert job row for tracking
    const { data: jobData, error: jobError } = await supabase
      .from('rule_generation_jobs')
      .insert({
        batch_id: batchId,
        telephely_id,
        user_id: uploaded_by || '',
        source: 'pdf_upload',
        protocol_id: null,
        protocol_name: file_name,
        status: 'pending',
        attempt: 1,
        max_attempts: MAX_ATTEMPTS,
      })
      .select('id')
      .single();

    if (jobError) {
      console.error('Error inserting job:', jobError);
      return new Response(JSON.stringify({
        ok: false, status: 'error', code: 'JOB_INSERT_ERROR',
        message: 'Failed to create job record', event_id: eventId,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 🚀 Start background processing
    EdgeRuntime.waitUntil(
      processPdfInBackground(
        supabase, jobData.id, webhookUrl, secondaryWebhookUrl,
        hmacSecret, payloadString, hexDigest, telephely_id, eventId
      )
    );

    // 🚀 Return immediately
    return new Response(JSON.stringify({
      ok: true,
      status: 'started',
      event_id: eventId,
      batch_id: batchId,
      job_id: jobData.id,
      message: 'PDF feldolgozás elindult háttérben',
    }), { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Unexpected error in szabalyepito-teszt-webhook:', error);
    return new Response(JSON.stringify({
      ok: false, status: 'error', code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error', event_id: eventId,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

