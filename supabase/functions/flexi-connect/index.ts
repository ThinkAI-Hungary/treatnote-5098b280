import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM encryption using Web Crypto API
async function encryptPassword(password: string, keyBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Decode the base64 key
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  
  // Import the key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Generate a random 12-byte IV (recommended for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt the password
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(password)
  );
  
  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('N8N_FLEXI_WEBHOOK_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('FLEXI_ENCRYPTION_KEY');
    
    if (!webhookUrl) {
      console.error('N8N_FLEXI_WEBHOOK_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!encryptionKey) {
      console.error('FLEXI_ENCRYPTION_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Encryption key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create client with user's token to get their info
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('User auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Invalid user session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { flexiEmail, flexiPassword } = await req.json();

    if (!flexiEmail || !flexiPassword) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending Flexi credentials to n8n webhook...');

    // Send to n8n and wait for response
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flexiEmail,
        flexiPassword,
        timestamp: new Date().toISOString(),
      }),
    });

    console.log('n8n webhook response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('n8n webhook error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to connect to Flexi-Dent', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse n8n response - expecting 1 or 0
    const responseText = await response.text();
    console.log('n8n response:', responseText);
    
    const n8nResult = parseInt(responseText.trim(), 10);
    
    if (n8nResult !== 1) {
      console.log('Flexi login failed (n8n returned 0)');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Flexi-Dent bejelentkezés sikertelen. Kérjük ellenőrizze az adatokat.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Login successful - get user's profile name
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const userName = profileData?.full_name || user.email || '';

    // Encrypt the password before storing
    const encryptedPassword = await encryptPassword(flexiPassword, encryptionKey);
    console.log('Password encrypted successfully');

    // Store in flexi_auth table (upsert to handle existing records)
    const { error: insertError } = await supabaseAdmin
      .from('flexi_auth')
      .upsert({
        user_id: user.id,
        name: userName,
        flexi_username: flexiEmail,
        flexi_pw: encryptedPassword,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (insertError) {
      console.error('Error storing flexi auth:', insertError);
      
      // Check for unique constraint violation on flexi_username
      if (insertError.code === '23505' && insertError.message?.includes('flexi_username')) {
        return new Response(
          JSON.stringify({ 
            error: 'Flexi account already linked', 
            success: false,
            message: 'Ez a Flexi-Dent fiók már egy másik felhasználóhoz van hozzárendelve.'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to save credentials', success: false }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Flexi auth stored successfully for user:', user.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Flexi-Dent sikeresen hozzácsatolva!' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in flexi-connect function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
