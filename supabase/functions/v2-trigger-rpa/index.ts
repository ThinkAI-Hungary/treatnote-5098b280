// ============================================================
// v2-trigger-rpa — Trigger RPA from TestSuite or any client
// Fetches flexi credentials server-side, POSTs to RPA server
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPA_SERVER_URL = Deno.env.get('RPA_SERVER_URL') || 'http://209.38.249.101:8900';
const RPA_SECRET = Deno.env.get('RPA_SECRET') || 'tn_rpa_2026_s3cur3_k3y';

// AES-256-GCM decryption
async function decryptPassword(encryptedBase64: string, keyBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decryptedData = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return decoder.decode(decryptedData);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('FLEXI_ENCRYPTION_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization') || '';
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { vizitek, paciensId } = body;

    if (!vizitek || !Array.isArray(vizitek) || vizitek.length === 0) {
      return new Response(JSON.stringify({ error: 'Hiányzó vizitek tömb' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user profile for telephelyId
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('current_telephely_id, company_id')
      .eq('user_id', user.id)
      .single();

    const telephelyId = profile?.current_telephely_id;
    if (!telephelyId) {
      return new Response(JSON.stringify({ error: 'Nincs telephely beállítva' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch flexi_domain + probapaciens_neve
    let flexiDomain = '';
    let effectivePaciensId = paciensId || '';
    const { data: telephelyData } = await supabaseAdmin
      .from('telephely')
      .select('flexi_domain, probapaciens_neve')
      .eq('id', telephelyId)
      .maybeSingle();
    if (telephelyData) {
      flexiDomain = telephelyData.flexi_domain || '';
      // Fallback to probapaciens_neve if no explicit paciensId
      if (!effectivePaciensId && telephelyData.probapaciens_neve) {
        effectivePaciensId = telephelyData.probapaciens_neve;
      }
    }

    if (!effectivePaciensId) {
      return new Response(JSON.stringify({ error: 'Hiányzó PaciensID — állítsd be a Próba páciens ID-t a Klinika Adminban' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch flexi credentials
    let flexiData: any = null;
    const { data: fd1 } = await supabaseAdmin
      .from('flexi_auth')
      .select('flexi_username, flexi_pw')
      .eq('user_id', user.id)
      .eq('telephely_id', telephelyId)
      .maybeSingle();
    flexiData = fd1;

    if (!flexiData) {
      const { data: fd2 } = await supabaseAdmin
        .from('flexi_auth')
        .select('flexi_username, flexi_pw')
        .eq('user_id', user.id)
        .is('telephely_id', null)
        .maybeSingle();
      flexiData = fd2;
    }

    if (!flexiData || !flexiDomain) {
      return new Response(JSON.stringify({ error: 'Hiányzó Flexi bejelentkezési adatok. Állítsd be a Flexi csatlakozást.' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flexiUsername = flexiData.flexi_username || '';
    let flexiPw = '';
    if (flexiData.flexi_pw && encryptionKey) {
      try {
        flexiPw = await decryptPassword(flexiData.flexi_pw, encryptionKey);
      } catch (e) {
        console.error('Decrypt error:', e);
      }
    }

    if (!flexiUsername || !flexiPw) {
      return new Response(JSON.stringify({ error: 'Flexi jelszó dekódolás sikertelen' }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call RPA server
    console.log(`[v2-trigger-rpa] Triggering RPA: domain=${flexiDomain} paciens=${effectivePaciensId} vizitek=${vizitek.length}`);

    const rpaPayload = {
      vizitek,
      flexi_domain: flexiDomain,
      flexi_username: flexiUsername,
      flexi_pw: flexiPw,
      PaciensID: effectivePaciensId,
    };

    const rpaResponse = await fetch(`${RPA_SERVER_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RPA-Key': RPA_SECRET,
      },
      body: JSON.stringify(rpaPayload),
      signal: AbortSignal.timeout(200_000),
    });

    const rpaResult = await rpaResponse.json();
    console.log(`[v2-trigger-rpa] RPA result: ok=${rpaResult.ok} step=${rpaResult.step}`);

    return new Response(JSON.stringify(rpaResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[v2-trigger-rpa] Error:', error);
    return new Response(JSON.stringify({
      ok: 0,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
