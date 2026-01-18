import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const webhookUrl = Deno.env.get('N8N_SZOTAR_RULES_WEBHOOK_URL');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase credentials');
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'CONFIG_ERROR', message: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhookUrl) {
      console.error('N8N_SZOTAR_RULES_WEBHOOK_URL not configured');
      return new Response(
        JSON.stringify({ ok: false, status: 'error', code: 'N8N_WEBHOOK_NOT_CONFIGURED', message: 'n8n webhook URL not configured' }),
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

    console.log('Sending payload to n8n webhook...');

    // Send to n8n webhook (synchronous - waiting for respond to webhook)
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`n8n webhook error: HTTP ${webhookResponse.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          status: 'error', 
          code: 'N8N_WEBHOOK_ERROR', 
          message: `Webhook returned ${webhookResponse.status}`,
          event_id: eventId 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse n8n response
    let n8nResponse: N8nResponse;
    try {
      n8nResponse = await webhookResponse.json();
      console.log('n8n response received:', JSON.stringify(n8nResponse, null, 2));
    } catch {
      console.error('Failed to parse n8n response as JSON');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          status: 'error', 
          code: 'N8N_INVALID_RESPONSE', 
          message: 'Invalid JSON response from n8n',
          event_id: eventId 
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for extractions in response
    const extractionsData = n8nResponse.extractions;
    if (!extractionsData || !Array.isArray(extractionsData) || extractionsData.length === 0) {
      console.log('No extractions in n8n response');
      return new Response(
        JSON.stringify({ 
          ok: true, 
          status: 'no_extractions', 
          message: 'No extractions returned from n8n',
          event_id: eventId 
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
