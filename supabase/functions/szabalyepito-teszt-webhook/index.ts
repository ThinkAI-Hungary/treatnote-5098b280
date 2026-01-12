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
  uploaded_by: string | null;
  timestamp: string;
}

interface SuccessResponse {
  ok: true;
  status: 'sent' | 'processed';
  event_id: string;
  inserted?: number;
  duplicates?: number;
}

interface ExtractionItem {
  fogalom: string;
  kategoria?: string;
  trigger_words?: string[];
  file_name?: string;
  parsed?: Record<string, unknown>;
}

interface ErrorResponse {
  ok: false;
  status: 'error';
  code: string;
  message: string;
  event_id: string;
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
      uploaded_by: uploaded_by || null,
      timestamp: new Date().toISOString(),
    };

    // Serialize payload (no pretty-printing)
    const payloadString = JSON.stringify(payload);
    console.log('Sending payload to n8n (excluding base64 content for log)');

    // Compute HMAC-SHA256 signature
    const hexDigest = await signPayload(hmacSecret, payloadString);
    console.log('Generated HMAC signature:', `sha256=${hexDigest}`);

    // Retry configuration: 3 attempts with 1s, 2s, 4s delays
    const delays = [1000, 2000, 4000];
    let lastError: string | null = null;
    let lastStatusCode: number | null = null;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        console.log(`Attempt ${attempt + 1} of ${delays.length + 1}: Sending to ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': `sha256=${hexDigest}`,
          },
          body: payloadString,
        });

        lastStatusCode = response.status;
        const responseText = await response.text();
        console.log(`Response status: ${response.status}, body: ${responseText.substring(0, 500)}`);

        // n8n Test Webhook URLs return this when the workflow isn't in "listening" mode.
        if (response.status === 404 && responseText.includes('not registered')) {
          console.error('n8n webhook not registered/active:', responseText);
          const errorResponse: ErrorResponse = {
            ok: false,
            status: 'error',
            code: 'N8N_WEBHOOK_NOT_REGISTERED',
            message: 'n8n webhook is not registered/active. If you are using the Test URL, click "Execute workflow" in n8n or switch to the Production URL.',
            event_id: eventId,
          };
          return new Response(JSON.stringify(errorResponse), {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (response.ok) {
          // Parse response to check for errors in body
          let responseData: Record<string, unknown> = {};
          try {
            responseData = JSON.parse(responseText);
          } catch {
            // Response might not be JSON, that's ok for success
          }

          // Check if response indicates error
          if (responseData.status === 'error' || responseData.error) {
            lastError = (responseData.message as string) || (responseData.error as string) || 'Unknown error from n8n';
            console.error(`n8n returned error in body: ${lastError}`);
            if (attempt < delays.length) {
              console.log(`Retrying in ${delays[attempt]}ms...`);
              await sleep(delays[attempt]);
              continue;
            }
          } else {
            // Check if n8n returned extractions synchronously (handle both direct and nested in body)
            const extractionsData = responseData.extractions 
              || (responseData.body as Record<string, unknown>)?.extractions;
            
            if (extractionsData && Array.isArray(extractionsData)) {
              console.log(`n8n returned ${extractionsData.length} extractions synchronously, processing...`);
              
              // Initialize Supabase client with service role
              const supabaseUrl = Deno.env.get('SUPABASE_URL');
              const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
              
              if (!supabaseUrl || !supabaseServiceKey) {
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

              const supabase = createClient(supabaseUrl, supabaseServiceKey);
              const extractions = extractionsData as ExtractionItem[];
              let insertedCount = 0;
              let duplicateCount = 0;

              for (const extraction of extractions) {
                if (!extraction.fogalom) {
                  console.log('Skipping extraction without fogalom');
                  continue;
                }

                const record = {
                  event_id: eventId,
                  source_file_name: file_name,
                  fogalom: extraction.fogalom,
                  kategoria: extraction.kategoria || null,
                  trigger_words: extraction.trigger_words || null,
                  parsed_file_name: extraction.file_name || null,
                  parsed_json: extraction.parsed || {},
                  company_id,
                  telephely_id,
                  uploaded_by: uploaded_by || null,
                };

                console.log(`Inserting extraction: ${extraction.fogalom}`);
                const { error: insertError } = await supabase
                  .from('szabalyepito_teszt_extractions')
                  .insert(record);

                if (insertError) {
                  if (insertError.code === '23505') {
                    console.log(`Duplicate detected for fogalom: ${extraction.fogalom}`);
                    duplicateCount++;
                  } else {
                    console.error('Insert error:', insertError);
                  }
                } else {
                  insertedCount++;
                }
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

            // No extractions in response, just acknowledge sent
            const successResponse: SuccessResponse = {
              ok: true,
              status: 'sent',
              event_id: eventId,
            };
            console.log('Webhook successful (no extractions):', JSON.stringify(successResponse));
            return new Response(JSON.stringify(successResponse), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          lastError = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
          console.error(`n8n returned non-2xx: ${lastError}`);
          if (attempt < delays.length) {
            console.log(`Retrying in ${delays[attempt]}ms...`);
            await sleep(delays[attempt]);
            continue;
          }
        }
      } catch (networkError) {
        lastError = networkError instanceof Error ? networkError.message : String(networkError);
        console.error(`Network error on attempt ${attempt + 1}: ${lastError}`);
        if (attempt < delays.length) {
          console.log(`Retrying in ${delays[attempt]}ms...`);
          await sleep(delays[attempt]);
          continue;
        }
      }
    }

    // All attempts failed
    console.error(`All ${delays.length + 1} attempts failed. Last error: ${lastError}`);
    const errorResponse: ErrorResponse = {
      ok: false,
      status: 'error',
      code: lastStatusCode ? `HTTP_${lastStatusCode}` : 'NETWORK_ERROR',
      message: lastError || 'Unknown error after all retries',
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
