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

    const { flexiEmail, flexiPassword, telephely_id: bodyTelephelyId } = await req.json();

    if (!flexiEmail || !flexiPassword) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's profile to find active telephely and flexi_domain
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('full_name, telephely_id, current_telephely_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // Prefer current_telephely_id (active) over telephely_id (home)
    const activeTelephelyId = profileData?.current_telephely_id || profileData?.telephely_id;

    let flexiDomain: string | null = null;

    if (activeTelephelyId) {
      const { data: telephelyData } = await supabaseAdmin
        .from('telephely')
        .select('flexi_domain')
        .eq('id', activeTelephelyId)
        .maybeSingle();

      flexiDomain = telephelyData?.flexi_domain || null;
    }

    // Use telephely_id from request body (passed by the frontend knowing the active telephely);
    // fall back to profile's active telephely if not provided.
    const resolvedTelephelyId: string | null = bodyTelephelyId || activeTelephelyId || null;

    if (!resolvedTelephelyId) {
      console.error('No telephely_id available – cannot scope Flexi connection');
      return new Response(
        JSON.stringify({ error: 'Telephely azonosító hiányzik. Kérjük válasszon telephelyet.', success: false }),
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
        flexi_domain: flexiDomain,
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

    // Login successful - use the already fetched profile name
    const userName = profileData?.full_name || user.email || '';

    // Encrypt the password before storing
    const encryptedPassword = await encryptPassword(flexiPassword, encryptionKey);
    console.log('Password encrypted successfully');

    // ── Global uniqueness check ──────────────────────────────────────────────
    // A flexi_username may only be linked to ONE TreatNote user (across ALL
    // their telephelyek). Another user cannot steal/share the same flexi account.
    const { data: globalLinks } = await supabaseAdmin
      .from('flexi_auth')
      .select('user_id, telephely_id')
      .eq('flexi_username', flexiEmail)
      .neq('user_id', user.id);

    if (globalLinks && globalLinks.length > 0) {
      console.log('Flexi account already linked to another user (globally)');

      // Check whether any of those rows belong to the SAME telephely so we can
      // show the conflicting user's name when relevant.
      const sameTelephelyRow = globalLinks.find(
        (r: { telephely_id: string | null }) => r.telephely_id === resolvedTelephelyId
      );

      let conflictUserName: string | null = null;
      if (sameTelephelyRow) {
        const { data: conflictProfile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', sameTelephelyRow.user_id)
          .maybeSingle();
        conflictUserName = conflictProfile?.full_name || conflictProfile?.email || null;
      }

      const message = conflictUserName
        ? `Ez a Flexi-Dent fiók már használatban van ezen a telephelyen (${conflictUserName}).`
        : 'Ez a Flexi-Dent fiók már egy másik felhasználóhoz van csatolva. Egy Flexi fiókot csak egy TreatNote felhasználó használhat.';

      return new Response(
        JSON.stringify({ error: 'Flexi account already linked', success: false, message }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete this user's record for THIS TELEPHELY (allows re-connection)
    await supabaseAdmin
      .from('flexi_auth')
      .delete()
      .eq('user_id', user.id)
      .eq('telephely_id', resolvedTelephelyId);

    // Delete any null-telephely rows for this user or the same flexi_username.
    // These are legacy rows created before per-telephely scoping was introduced
    // and would violate the old global UNIQUE(flexi_username) constraint.
    await supabaseAdmin
      .from('flexi_auth')
      .delete()
      .is('telephely_id', null)
      .or(`user_id.eq.${user.id},flexi_username.eq.${flexiEmail}`);

    // UPSERT new record scoped to this telephely.
    // Using upsert with onConflict on (user_id, telephely_id) so that:
    // - reconnecting the same telephely works (update instead of error)
    // - inserting a new telephely row works (insert)
    const rowPayload = {
      user_id: user.id,
      telephely_id: resolvedTelephelyId,
      name: userName,
      flexi_username: flexiEmail,
      flexi_pw: encryptedPassword,
      updated_at: new Date().toISOString(),
    };

    let { error: insertError } = await supabaseAdmin
      .from('flexi_auth')
      .upsert(rowPayload, { onConflict: 'user_id,telephely_id' });

    // If we get a unique-constraint error on flexi_username (old schema without
    // fix-flexi-constraints having been run), fall back: delete ALL same-user rows
    // with the same flexi_username (across ANY telephely) and retry the insert.
    // This handles the transition period where the DB still has the global constraint.
    if (insertError && insertError.code === '23505') {
      console.warn('Unique constraint hit — likely old schema. Clearing and retrying.', insertError.message);
      await supabaseAdmin
        .from('flexi_auth')
        .delete()
        .eq('user_id', user.id)
        .eq('flexi_username', flexiEmail);

      const retry = await supabaseAdmin
        .from('flexi_auth')
        .insert(rowPayload);
      insertError = retry.error;
    }

    if (insertError) {
      console.error('Error storing flexi auth:', insertError);
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
