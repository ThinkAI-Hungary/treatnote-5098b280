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
  trigger_words?: string[];
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const eventId = generateUUID();

  try {
    // Get secrets
    const webhookUrl = Deno.env.get('N8N_SZABALYEPITO_TESZT_WEBHOOK_URL');
    const hmacSecret = Deno.env.get('N8N_SZABALYEPITO_TESZT_HMAC_SECRET');
    // Secondary webhook URL (hardcoded as requested)
    const secondaryWebhookUrl = 'https://n8n.thinkaimedical.hu/webhook-test/7dc774fc-90bb-4f50-bac2-0f18b0d13ed4';

    if (!webhookUrl || !hmacSecret) {
      console.error('Missing required secrets: N8N_SZABALYEPITO_TESZT_WEBHOOK_URL or N8N_SZABALYEPITO_TESZT_HMAC_SECRET');
      const errorResponse: ErrorResponse = {
        ok: false,
        status: 'error',
        code: 'CONFIG_ERROR',
        message: 'Webhook configuration missing',
        event_id: eventId,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body = await req.json();
    console.log('Received request body keys:', Object.keys(body));

    const {
      file_name,
      file_content_base64,
      company_id,
      company_name,
      telephely_id,
      telephely_name,
      uploaded_by,
    } = body;

    // Validate required fields
    if (!file_name || !file_content_base64 || !company_id || !company_name || !telephely_id || !telephely_name) {
      console.error('Missing required fields in request body');
      const errorResponse: ErrorResponse = {
        ok: false,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'Missing required fields',
        event_id: eventId,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate slugs
    const companySlug = sanitizeSlug(company_name);
    const telephelySlug = sanitizeSlug(telephely_name);
    const fileSlug = sanitizeSlug(file_name.replace(/\.pdf$/i, ''));

    // Fetch telephely to get flexi_domain and szotar data
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    let flexiDomain: string | null = null;
    let szotarData: SzotarData | null = null;
    
    if (supabaseUrl && supabaseServiceKey && telephely_id) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Fetch flexi_domain from telephely
      const { data: telephelyData, error: telephelyError } = await supabase
        .from('telephely')
        .select('flexi_domain')
        .eq('id', telephely_id)
        .maybeSingle();
      
      if (telephelyError) {
        console.error('Error fetching telephely:', telephelyError);
      } else if (telephelyData) {
        flexiDomain = telephelyData.flexi_domain || null;
      }

      // Fetch szotar content
      const { data: szotarRecord, error: szotarError } = await supabase
        .from('szotar')
        .select('content')
        .eq('telephely_id', telephely_id)
        .maybeSingle();

      if (szotarError) {
        console.error('Error fetching szotar:', szotarError);
      }

      // Fetch szotar_kezelesek
      const { data: kezelesekRecords, error: kezelesekError } = await supabase
        .from('szotar_kezelesek')
        .select('id, name, category')
        .eq('telephely_id', telephely_id);

      if (kezelesekError) {
        console.error('Error fetching szotar_kezelesek:', kezelesekError);
      }

      // Combine into szotarData
      szotarData = {
        content: szotarRecord?.content || null,
        kezelesek: (kezelesekRecords as SzotarKezelesItem[]) || [],
      };
      console.log(`Including szotar with ${szotarData.kezelesek.length} kezelések in payload`);
    }

    // Build payload
    const payload: WebhookPayload = {
      version: '1.0',
      event_id: eventId,
      file_name,
      file_slug: fileSlug,
      file_content_base64,
      company_id,
      company_name,
      company_slug: companySlug,
      telephely_id,
      telephely_name,
      telephely_slug: telephelySlug,
      flexi_domain: flexiDomain,
      uploaded_by: uploaded_by || null,
      szotar: szotarData,
      timestamp: new Date().toISOString(),
    };

    // Serialize payload (no pretty-printing)
    const payloadString = JSON.stringify(payload);
    console.log('Sending payload to n8n webhooks (excluding base64 content for log)');

    // Compute HMAC-SHA256 signature
    const hexDigest = await signPayload(hmacSecret, payloadString);
    console.log('Generated HMAC signature:', `sha256=${hexDigest}`);

    // Helper function to call a single webhook with retries
    async function callWebhookWithRetries(url: string, urlName: string): Promise<{ success: boolean; responseData?: Record<string, unknown>; error?: string }> {
      const delays = [1000, 2000, 4000];
      let lastError: string | null = null;

      for (let attempt = 0; attempt <= delays.length; attempt++) {
        try {
          console.log(`[${urlName}] Attempt ${attempt + 1} of ${delays.length + 1}: Sending to ${url}`);

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

          // n8n Test Webhook URLs return this when the workflow isn't in "listening" mode - not a hard failure
          if (response.status === 404 && responseText.includes('not registered')) {
            console.log(`[${urlName}] Webhook not registered/active, continuing to next webhook`);
            return { success: false, error: 'Webhook not registered' };
          }

          if (response.ok) {
            let responseData: Record<string, unknown> = {};
            try {
              responseData = JSON.parse(responseText);
            } catch {
              // Response might not be JSON, that's ok for success
            }

            // Check if response indicates error
            if (responseData.status === 'error' || responseData.error) {
              lastError = (responseData.message as string) || (responseData.error as string) || 'Unknown error from n8n';
              console.error(`[${urlName}] n8n returned error in body: ${lastError}`);
              if (attempt < delays.length) {
                console.log(`[${urlName}] Retrying in ${delays[attempt]}ms...`);
                await sleep(delays[attempt]);
                continue;
              }
            } else {
              console.log(`[${urlName}] Webhook successful`);
              return { success: true, responseData };
            }
          } else {
            lastError = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
            console.error(`[${urlName}] n8n returned non-2xx: ${lastError}`);
            if (attempt < delays.length) {
              console.log(`[${urlName}] Retrying in ${delays[attempt]}ms...`);
              await sleep(delays[attempt]);
              continue;
            }
          }
        } catch (networkError) {
          lastError = networkError instanceof Error ? networkError.message : String(networkError);
          console.error(`[${urlName}] Network error on attempt ${attempt + 1}: ${lastError}`);
          if (attempt < delays.length) {
            console.log(`[${urlName}] Retrying in ${delays[attempt]}ms...`);
            await sleep(delays[attempt]);
            continue;
          }
        }
      }

      return { success: false, error: lastError || 'Unknown error after all retries' };
    }

    // Call both webhooks in parallel
    console.log('Calling both webhooks in parallel...');
    const [primaryResult, secondaryResult] = await Promise.all([
      callWebhookWithRetries(webhookUrl, 'PRIMARY'),
      callWebhookWithRetries(secondaryWebhookUrl, 'SECONDARY'),
    ]);

    console.log(`Primary webhook result: success=${primaryResult.success}, error=${primaryResult.error || 'none'}`);
    console.log(`Secondary webhook result: success=${secondaryResult.success}, error=${secondaryResult.error || 'none'}`);

    // Success if either webhook succeeded
    const anySuccess = primaryResult.success || secondaryResult.success;
    const successfulResult = primaryResult.success ? primaryResult : secondaryResult;

    if (anySuccess && successfulResult.responseData) {
      // Check if n8n returned extractions synchronously (handle both direct and nested in body)
      const extractionsData = successfulResult.responseData.extractions 
        || (successfulResult.responseData.body as Record<string, unknown>)?.extractions;
      
      if (extractionsData && Array.isArray(extractionsData)) {
        console.log(`n8n returned ${extractionsData.length} extractions synchronously, processing...`);
        
        // Initialize Supabase client with service role
        const supabaseUrlForInsert = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKeyForInsert = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (!supabaseUrlForInsert || !supabaseServiceKeyForInsert) {
          console.error('Missing Supabase credentials for DB insert');
          const errorResponse: ErrorResponse = {
            ok: false,
            status: 'error',
            code: 'CONFIG_ERROR',
            message: 'Supabase configuration missing',
            event_id: eventId,
          };
          return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const supabaseForInsert = createClient(supabaseUrlForInsert, supabaseServiceKeyForInsert);
        const extractions = extractionsData as ExtractionItem[];
        let insertedCount = 0;
        let duplicateCount = 0;

        for (const extraction of extractions) {
          if (!extraction.fogalom) {
            console.log('Skipping extraction without fogalom');
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

          // Insert directly into treatment_rules (normalized structure)
          console.log(`Inserting treatment rule: ${extraction.fogalom}`);
          
          const { data: ruleData, error: ruleError } = await supabaseForInsert
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
              continue;
            }
          }

          // Insert visits and items
          const visits = extraction.parsed?.visits || [];
          for (let vi = 0; vi < visits.length; vi++) {
            const visit = visits[vi];
            
            const { data: visitData, error: visitError } = await supabaseForInsert
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

              const { error: itemsError } = await supabaseForInsert
                .from('rule_items')
                .insert(itemsToInsert);

              if (itemsError) {
                console.error('Items insert error:', itemsError);
              }
            }
          }

          insertedCount++;
        }

        console.log(`Processing complete: ${insertedCount} inserted, ${duplicateCount} duplicates`);
        const successResponse: SuccessResponse = {
          ok: true,
          status: 'processed',
          event_id: eventId,
          inserted: insertedCount,
          duplicates: duplicateCount,
        };
        return new Response(JSON.stringify(successResponse), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (anySuccess) {
      // No extractions in response, just acknowledge sent
      const successResponse: SuccessResponse = {
        ok: true,
        status: 'sent',
        event_id: eventId,
      };
      console.log('At least one webhook successful (no extractions):', JSON.stringify(successResponse));
      return new Response(JSON.stringify(successResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Both webhooks failed
    console.error('Both webhooks failed');
    const errorResponse: ErrorResponse = {
      ok: false,
      status: 'error',
      code: 'ALL_WEBHOOKS_FAILED',
      message: `Primary: ${primaryResult.error || 'Unknown error'}, Secondary: ${secondaryResult.error || 'Unknown error'}`,
      event_id: eventId,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error in szabalyepito-teszt-webhook:', error);
    const errorResponse: ErrorResponse = {
      ok: false,
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      event_id: eventId,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
