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
  if (!body.pdf_id || typeof body.pdf_id !== 'string') {
    return { valid: false, error: 'Missing or invalid pdf_id' };
  }
  if (!body.status || !['pending', 'processing', 'completed', 'failed'].includes(body.status as string)) {
    return { valid: false, error: 'Invalid status. Must be: pending, processing, completed, or failed' };
  }
  // Completed status requires extraction_data
  if (body.status === 'completed' && !body.extraction_data) {
    return { valid: false, error: 'extraction_data is required when status is completed' };
  }
  return { valid: true };
}

// Map incoming status to webhook_status
function mapWebhookStatus(status: string): string {
  switch (status) {
    case 'pending':
    case 'processing':
      return 'processing';
    case 'completed':
      return 'processed';
    case 'failed':
      return 'error';
    default:
      return 'processing';
  }
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
    const hmacSecret = Deno.env.get('N8N_EXTRACTION_HMAC_SECRET');
    if (!hmacSecret) {
      console.error('N8N_EXTRACTION_HMAC_SECRET not configured');
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

    const { event_id, pdf_id, status, extraction_data, error_message } = body as {
      event_id: string;
      pdf_id: string;
      status: string;
      extraction_data?: Record<string, unknown>;
      error_message?: string;
    };

    console.log(`Processing extraction callback: event_id=${event_id}, pdf_id=${pdf_id}, status=${status}`);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify PDF exists
    const { data: pdfData, error: pdfError } = await supabase
      .from('feltoltott_pdf')
      .select('id')
      .eq('id', pdf_id)
      .single();

    if (pdfError || !pdfData) {
      console.warn(`PDF not found: ${pdf_id}`);
      return new Response(
        JSON.stringify({ ok: false, error: 'PDF not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`PDF verified: ${pdf_id}`);

    // Prepare extraction record
    const now = new Date().toISOString();
    const extractionRecord: Record<string, unknown> = {
      event_id,
      document_id: pdf_id,
      status,
      error_message: error_message || null,
    };

    // Set raw_json for completed status
    if (status === 'completed' && extraction_data) {
      extractionRecord.raw_json = extraction_data;
      // Optionally compute items_count if extraction_data has items array
      if (Array.isArray(extraction_data.items)) {
        extractionRecord.items_count = extraction_data.items.length;
      }
    }

    // Set timestamps
    if (status === 'processing' || status === 'pending') {
      extractionRecord.started_at = now;
    }
    if (status === 'completed' || status === 'failed') {
      extractionRecord.finished_at = now;
    }

    // Idempotent insert
    const { data: insertData, error: insertError } = await supabase
      .from('pdf_extractions')
      .insert(extractionRecord)
      .select('id')
      .single();

    // Check if this was a duplicate (conflict on event_id)
    if (insertError) {
      // Check if it's a unique constraint violation (duplicate event_id)
      if (insertError.code === '23505') {
        console.log(`Duplicate event_id detected: ${event_id}, returning idempotent response`);
        return new Response(
          JSON.stringify({ ok: true, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Database insert failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Extraction record created: ${insertData.id}`);

    // Update feltoltott_pdf.webhook_status (only on first insert, not duplicates)
    const webhookStatus = mapWebhookStatus(status);
    const { error: updateError } = await supabase
      .from('feltoltott_pdf')
      .update({ webhook_status: webhookStatus })
      .eq('id', pdf_id);

    if (updateError) {
      console.error('Failed to update webhook_status:', updateError);
      // Don't fail the request, extraction was recorded
    } else {
      console.log(`Updated feltoltott_pdf.webhook_status to '${webhookStatus}' for pdf_id=${pdf_id}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
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
