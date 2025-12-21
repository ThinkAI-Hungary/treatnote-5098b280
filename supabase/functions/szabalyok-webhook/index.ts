import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

interface WebhookPayloadV1_1 {
  version: string;
  event_id: string;
  pdf_id: string;
  file_name: string;
  file_slug: string;
  fogalom: string | null;
  company_id: string;
  company_name: string;
  company_slug: string;
  telephely_id: string;
  telephely_name: string;
  telephely_slug: string;
  timestamp: string;
  epoch_millis: number;
  storage_path: string;
  checksum_sha256?: string;
}

interface SuccessResponse {
  ok: true;
  status: 'processed';
  pdf_id: string;
  event_id: string;
  storage_path: string;
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
    const webhookUrl = Deno.env.get('N8N_SZABALYOK_WEBHOOK_URL');
    const hmacSecret = Deno.env.get('N8N_SZABALYOK_HMAC_SECRET');

    if (!webhookUrl || !hmacSecret) {
      console.error('Missing required secrets: N8N_SZABALYOK_WEBHOOK_URL or N8N_SZABALYOK_HMAC_SECRET');
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
    console.log('Received request body:', JSON.stringify(body, null, 2));

    const {
      pdf_id,
      file_name,
      fogalom,
      company_id,
      company_name,
      telephely_id,
      telephely_name,
      epoch_millis,
      storage_path,
      checksum_sha256,
    } = body;

    // Validate required fields
    if (!pdf_id || !file_name || !company_id || !company_name || !telephely_id || !telephely_name || !epoch_millis || !storage_path) {
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

    // Validate epoch_millis is a number
    if (typeof epoch_millis !== 'number') {
      console.error('epoch_millis must be a number');
      const errorResponse: ErrorResponse = {
        ok: false,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'epoch_millis must be a number',
        event_id: eventId,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate checksum if provided
    if (checksum_sha256 && (typeof checksum_sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(checksum_sha256))) {
      console.error('Invalid checksum_sha256 format');
      const errorResponse: ErrorResponse = {
        ok: false,
        status: 'error',
        code: 'VALIDATION_ERROR',
        message: 'checksum_sha256 must be a 64-character hex string',
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

    // Build v1.1 payload with canonical field order
    const payload: WebhookPayloadV1_1 = {
      version: '1.1',
      event_id: eventId,
      pdf_id,
      file_name,
      file_slug: fileSlug,
      fogalom: fogalom || null,
      company_id,
      company_name,
      company_slug: companySlug,
      telephely_id,
      telephely_name,
      telephely_slug: telephelySlug,
      timestamp: new Date().toISOString(),
      epoch_millis,
      storage_path,
    };

    // Add optional checksum
    if (checksum_sha256) {
      payload.checksum_sha256 = checksum_sha256;
    }

    // Serialize payload (no pretty-printing)
    const payloadString = JSON.stringify(payload);
    console.log('Sending payload to n8n:', payloadString);

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
        console.log(`Response status: ${response.status}, body: ${responseText}`);

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
            // Success!
            const successResponse: SuccessResponse = {
              ok: true,
              status: 'processed',
              pdf_id,
              event_id: eventId,
              storage_path,
            };
            console.log('Webhook successful:', JSON.stringify(successResponse));
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
    console.error('Unexpected error in szabalyok-webhook:', error);
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
