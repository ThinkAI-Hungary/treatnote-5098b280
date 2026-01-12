import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
};

// Constant-time comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Compute HMAC-SHA256 signature
async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate required fields
function validatePayload(body: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!body.event_id || typeof body.event_id !== 'string') {
    return { valid: false, error: 'Missing or invalid event_id' };
  }
  if (!body.source_file_name || typeof body.source_file_name !== 'string') {
    return { valid: false, error: 'Missing or invalid source_file_name' };
  }
  if (!body.company_id || typeof body.company_id !== 'string') {
    return { valid: false, error: 'Missing or invalid company_id' };
  }
  if (!body.telephely_id || typeof body.telephely_id !== 'string') {
    return { valid: false, error: 'Missing or invalid telephely_id' };
  }
  if (!body.uploaded_by || typeof body.uploaded_by !== 'string') {
    return { valid: false, error: 'Missing or invalid uploaded_by' };
  }
  if (!body.extractions || !Array.isArray(body.extractions)) {
    return { valid: false, error: 'Missing or invalid extractions array' };
  }
  return { valid: true };
}

interface ExtractionItem {
  fogalom: string;
  kategoria?: string;
  trigger_words?: string[];
  file_name?: string;
  parsed?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get HMAC secret
    const hmacSecret = Deno.env.get('N8N_SZABALYEPITO_TESZT_HMAC_SECRET');
    if (!hmacSecret) {
      console.error('N8N_SZABALYEPITO_TESZT_HMAC_SECRET not configured');
      return new Response(
        JSON.stringify({ ok: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get raw body for HMAC verification
    const rawBody = await req.text();
    
    // Verify HMAC signature
    const signatureHeader = req.headers.get('x-signature') || req.headers.get('X-Signature');
    if (!signatureHeader) {
      console.warn('Missing X-Signature header');
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse signature (format: sha256=<hex>)
    const signatureParts = signatureHeader.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      console.warn('Invalid signature format:', signatureHeader);
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid signature format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const providedSignature = signatureParts[1].toLowerCase();

    // Compute expected signature
    const expectedSignature = await computeHmac(hmacSecret, rawBody);

    // Constant-time comparison
    if (!secureCompare(providedSignature, expectedSignature)) {
      console.warn('Invalid HMAC signature');
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('HMAC signature verified successfully');

    // Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate payload
    const validation = validatePayload(body);
    if (!validation.valid) {
      console.warn('Payload validation failed:', validation.error);
      return new Response(
        JSON.stringify({ ok: false, error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { event_id, source_file_name, company_id, telephely_id, uploaded_by, extractions } = body as {
      event_id: string;
      source_file_name: string;
      company_id: string;
      telephely_id: string;
      uploaded_by: string;
      extractions: ExtractionItem[];
    };

    console.log(`Processing extraction callback: event_id=${event_id}, source_file_name=${source_file_name}, extractions_count=${extractions.length}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert each extraction as a separate record
    let insertedCount = 0;
    let duplicateCount = 0;
    const errors: string[] = [];

    for (const extraction of extractions) {
      if (!extraction.fogalom) {
        console.warn('Skipping extraction without fogalom');
        continue;
      }

      const record = {
        event_id,
        source_file_name,
        fogalom: extraction.fogalom,
        kategoria: extraction.kategoria || null,
        trigger_words: extraction.trigger_words || null,
        parsed_file_name: extraction.file_name || null,
        parsed_json: extraction.parsed || {},
        company_id,
        telephely_id,
        uploaded_by,
      };

      const { error: insertError } = await supabase
        .from('szabalyepito_teszt_extractions')
        .insert(record);

      if (insertError) {
        // Check if it's a unique constraint violation (duplicate event_id + fogalom)
        if (insertError.code === '23505') {
          console.log(`Duplicate entry for event_id=${event_id}, fogalom=${extraction.fogalom}`);
          duplicateCount++;
        } else {
          console.error('Insert error:', insertError);
          errors.push(`Failed to insert fogalom "${extraction.fogalom}": ${insertError.message}`);
        }
      } else {
        insertedCount++;
      }
    }

    console.log(`Extraction callback complete: inserted=${insertedCount}, duplicates=${duplicateCount}, errors=${errors.length}`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        inserted: insertedCount, 
        duplicates: duplicateCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
