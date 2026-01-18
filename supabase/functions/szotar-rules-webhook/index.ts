import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Webhook URLs
const PRIMARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";
const SECONDARY_WEBHOOK_URL = "https://n8n.thinkaimedical.hu/webhook-test/99f5b5e4-6e0e-49d1-9277-da2d08d7fd85";

// Helper functions
function generateUUID(): string {
  return crypto.randomUUID();
}

function mapTargetToothType(value?: string): 'all' | 'pillar_only' | 'pontic_only' {
  const lower = (value || '').toLowerCase();
  if (lower === 'pillar_only' || lower === 'pillar' || lower.includes('pillér')) return 'pillar_only';
  if (lower === 'pontic_only' || lower === 'pontic' || lower.includes('pótfog')) return 'pontic_only';
  return 'all';
}

function mapScaling(value?: string): 'per_tooth' | 'per_case' | 'fix' {
  const lower = (value || '').toLowerCase();
  if (lower === 'per_case' || lower.includes('eset')) return 'per_case';
  if (lower === 'fix') return 'fix';
  return 'per_tooth';
}

// Types for szótár data
interface SzotarKezelesItem {
  id: string;
  name: string;
  category: string;
}

interface SzotarData {
  content: Record<string, unknown>;
  kezelesek: SzotarKezelesItem[];
}

interface WebhookPayload {
  version: string;
  event_id: string;
  telephely_id: string;
  telephely_name: string;
  flexi_domain: string | null;
  user_id: string;
  szotar: SzotarData;
  timestamp: string;
}

// Response types from n8n
interface VisitItem {
  name: string;
  qty?: number;
  unit?: string;
  scaling?: string;
  target_tooth_type?: string;
}

interface ParsedVisit {
  visit_no?: number;
  duration_days?: number;
  healing_time_months?: number;
  items: VisitItem[];
}

interface ExtractionItem {
  fogalom: string;
  kategoria?: string;
  trigger_words?: string[] | Record<string, string>;
  parsed?: {
    visits: ParsedVisit[];
  };
}

interface N8nResponse {
  extractions?: ExtractionItem[];
}

interface WebhookResult {
  success: boolean;
  error?: string;
  response?: N8nResponse;
}

// Call a single webhook and parse response
async function callWebhook(url: string, payload: WebhookPayload, name: string): Promise<WebhookResult> {
  try {
    console.log(`[${name}] Calling webhook...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${name}] HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const responseText = await response.text();
    let responseData: N8nResponse;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      console.error(`[${name}] Invalid JSON response`);
      console.error(`[${name}] Raw response was: ${responseText.substring(0, 500)}`);
      return { success: false, error: 'Invalid JSON response' };
    }

    // Detailed logging of full n8n response
    console.log(`[${name}] ===== FULL N8N RESPONSE START =====`);
    console.log(`[${name}] Raw response text: ${responseText}`);
    console.log(`[${name}] Parsed response: ${JSON.stringify(responseData, null, 2)}`);
    console.log(`[${name}] Has 'extractions' field: ${!!responseData?.extractions}`);
    console.log(`[${name}] Extractions type: ${typeof responseData?.extractions}`);
    console.log(`[${name}] Is array: ${Array.isArray(responseData?.extractions)}`);
    console.log(`[${name}] Extractions count: ${responseData?.extractions?.length || 0}`);
    console.log(`[${name}] All response keys: ${Object.keys(responseData || {}).join(', ')}`);
    console.log(`[${name}] ===== FULL N8N RESPONSE END =====`);

    console.log(`[${name}] Success, received response`);
    return { success: true, response: responseData };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${name}] Network error: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const eventId = generateUUID();
  console.log(`[szotar-rules-webhook] Starting with event_id: ${eventId}`);

  try {
    // Parse request body
    const body = await req.json();
    const { telephely_id, user_id } = body;

    if (!telephely_id) {
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'MISSING_TELEPHELY', message: 'telephely_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'CONFIG_ERROR', message: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch telephely info
    console.log(`Fetching telephely info for: ${telephely_id}`);
    const { data: telephelyData, error: telephelyError } = await supabase
      .from('telephely')
      .select('name, flexi_domain')
      .eq('id', telephely_id)
      .single();

    if (telephelyError) {
      console.error('Error fetching telephely:', telephelyError);
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'TELEPHELY_NOT_FOUND', message: 'Telephely not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch szotar content
    console.log('Fetching szotar content...');
    const { data: szotarData } = await supabase
      .from('szotar')
      .select('content')
      .eq('telephely_id', telephely_id)
      .single();

    // Fetch szotar_kezelesek
    console.log('Fetching szotar_kezelesek...');
    const { data: kezelesekData, error: kezelesekError } = await supabase
      .from('szotar_kezelesek')
      .select('id, name, category')
      .eq('telephely_id', telephely_id)
      .order('name');

    if (kezelesekError) {
      console.error('Error fetching szotar_kezelesek:', kezelesekError);
    }

    // Build szótár object
    const szotar: SzotarData = {
      content: szotarData?.content || {},
      kezelesek: (kezelesekData || []).map(k => ({
        id: k.id,
        name: k.name,
        category: k.category || '',
      })),
    };

    console.log(`Found ${szotar.kezelesek.length} kezelesek entries`);

    // Build webhook payload
    const payload: WebhookPayload = {
      version: '1.0',
      event_id: eventId,
      telephely_id,
      telephely_name: telephelyData.name,
      flexi_domain: telephelyData.flexi_domain,
      user_id: user_id || '',
      szotar,
      timestamp: new Date().toISOString(),
    };

    console.log('Sending payload to both n8n webhooks in parallel...');

    // Call both webhooks in parallel
    const [primaryResult, secondaryResult] = await Promise.all([
      callWebhook(PRIMARY_WEBHOOK_URL, payload, 'PRIMARY'),
      callWebhook(SECONDARY_WEBHOOK_URL, payload, 'SECONDARY'),
    ]);

    console.log(`Primary result: success=${primaryResult.success}, error=${primaryResult.error || 'none'}`);
    console.log(`Secondary result: success=${secondaryResult.success}, error=${secondaryResult.error || 'none'}`);

    // Check if at least one succeeded
    const anySuccess = primaryResult.success || secondaryResult.success;
    
    if (!anySuccess) {
      console.error('Both webhooks failed');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          status: 'error', 
          code: 'ALL_WEBHOOKS_FAILED', 
          message: `Primary: ${primaryResult.error}, Secondary: ${secondaryResult.error}`,
          event_id: eventId 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the successful response (prefer primary)
    let successfulResponse = primaryResult.success ? primaryResult.response : secondaryResult.response;
    const usedWebhook = primaryResult.success ? 'PRIMARY' : 'SECONDARY';

    // Detailed logging of which response we're using
    console.log(`===== USING ${usedWebhook} WEBHOOK RESPONSE =====`);
    console.log(`Full successful response object: ${JSON.stringify(successfulResponse, null, 2)}`);

    // Handle array-wrapped response from n8n
    // n8n sometimes returns [{ extractions: [...] }] instead of { extractions: [...] }
    if (Array.isArray(successfulResponse) && successfulResponse.length > 0) {
      console.log('Response is array-wrapped, extracting first element');
      successfulResponse = successfulResponse[0];
    }

    // Check for extractions in response
    const extractionsData = successfulResponse?.extractions;
    console.log(`Extractions field check:`);
    console.log(`  - exists: ${extractionsData !== undefined}`);
    console.log(`  - type: ${typeof extractionsData}`);
    console.log(`  - isArray: ${Array.isArray(extractionsData)}`);
    console.log(`  - length: ${extractionsData?.length || 0}`);
    
    if (!extractionsData || !Array.isArray(extractionsData) || extractionsData.length === 0) {
      console.log('No valid extractions found in n8n response');
      console.log(`All keys in response: ${Object.keys(successfulResponse || {}).join(', ')}`);
      if (successfulResponse && typeof successfulResponse === 'object') {
        console.log(`Response structure preview: ${JSON.stringify(successfulResponse, null, 2).substring(0, 1000)}`);
      }
      return new Response(
        JSON.stringify({ 
          ok: true, 
          status: 'no_extractions', 
          message: 'No extractions returned from n8n',
          event_id: eventId,
          primary: primaryResult.success,
          secondary: secondaryResult.success,
          response_keys: Object.keys(successfulResponse || {})
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${extractionsData.length} extractions...`);

    // Process extractions and insert into database
    let insertedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const extraction of extractionsData) {
      if (!extraction.fogalom) {
        console.log('Skipping extraction without fogalom');
        errorCount++;
        continue;
      }

      // Parse trigger words - handle various formats
      let triggerWords: string[] = [];
      if (extraction.trigger_words) {
        if (Array.isArray(extraction.trigger_words)) {
          triggerWords = extraction.trigger_words;
        } else if (typeof extraction.trigger_words === 'object') {
          triggerWords = Object.values(extraction.trigger_words).filter(v => typeof v === 'string') as string[];
        }
      }

      console.log(`Inserting treatment rule: ${extraction.fogalom}`);

      // Insert into treatment_rules
      const { data: ruleData, error: ruleError } = await supabase
        .from('treatment_rules')
        .insert({
          clinic_id: telephely_id,
          name: extraction.fogalom,
          category: extraction.kategoria || null,
          trigger_words: triggerWords,
        })
        .select('id')
        .single();

      if (ruleError) {
        if (ruleError.code === '23505') {
          console.log(`Duplicate detected for fogalom: ${extraction.fogalom}`);
          duplicateCount++;
          continue;
        } else {
          console.error('Rule insert error:', ruleError);
          errorCount++;
          continue;
        }
      }

      // Insert visits and items
      const visits = extraction.parsed?.visits || [];
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

        if (visitError) {
          console.error('Visit insert error:', visitError);
          continue;
        }

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

          const { error: itemsError } = await supabase
            .from('rule_items')
            .insert(itemsToInsert);

          if (itemsError) {
            console.error('Items insert error:', itemsError);
          }
        }
      }

      insertedCount++;
    }

    console.log(`Processing complete: ${insertedCount} inserted, ${duplicateCount} duplicates, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'processed',
        event_id: eventId,
        inserted: insertedCount,
        duplicates: duplicateCount,
        errors: errorCount,
        primary: primaryResult.success,
        secondary: secondaryResult.success,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in szotar-rules-webhook:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        event_id: eventId,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
