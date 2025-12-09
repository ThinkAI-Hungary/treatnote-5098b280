import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM decryption using Web Crypto API
async function decryptPassword(encryptedBase64: string, keyBase64: string): Promise<string> {
  const decoder = new TextDecoder();
  
  // Decode the base64 key
  const keyData = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  
  // Import the key for AES-GCM
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decode the encrypted data (IV + ciphertext)
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  // Decrypt
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  
  return decoder.decode(decryptedData);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get('FLEXI_ENCRYPTION_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const formData = await req.formData();
    const audio = formData.get("audio") as File;
    const mode = formData.get("mode") as string;
    const timestamp = formData.get("timestamp") as string;
    const filename = formData.get("filename") as string;
    const userId = formData.get("user_id") as string;
    const companyId = formData.get("company_id") as string;
    const telephelyId = formData.get("telephely_id") as string;

    if (!audio || !mode) {
      console.error("Missing required fields: audio or mode");
      return new Response(
        JSON.stringify({ error: "Missing required fields: audio and mode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch flexi credentials directly from database using user_id
    let flexiUsername = "";
    let decryptedFlexiPw = "";
    
    if (userId) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data: flexiData, error: flexiError } = await supabaseAdmin
        .from('flexi_auth')
        .select('flexi_username, flexi_pw')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (flexiError) {
        console.error("Error fetching flexi credentials:", flexiError);
      } else if (flexiData) {
        flexiUsername = flexiData.flexi_username || "";
        
        // Decrypt the password if we have it and the encryption key
        if (flexiData.flexi_pw && encryptionKey) {
          try {
            decryptedFlexiPw = await decryptPassword(flexiData.flexi_pw, encryptionKey);
            console.log("Flexi password decrypted successfully");
          } catch (decryptError) {
            console.error("Failed to decrypt Flexi password:", decryptError);
          }
        }
      }
    }

    // Use provided filename or fall back to audio.name
    const finalFilename = filename || audio.name;
    console.log(`Processing voice recording - Mode: ${mode}, Timestamp: ${timestamp}, Filename: ${finalFilename}, User: ${userId}, Company: ${companyId}, Telephely: ${telephelyId}, FlexiUser: ${flexiUsername}`);

    // Get webhook URLs based on mode
    let webhookUrls: string[] = [];
    
    if (mode === "voxis") {
      const voxisUrl = Deno.env.get("N8N_VOXIS_WEBHOOK_URL");
      if (voxisUrl) {
        webhookUrls.push(voxisUrl);
      }
    } else if (mode === "treatnote") {
      const treatnoteUrl = Deno.env.get("N8N_TREATNOTE_WEBHOOK_URL");
      if (treatnoteUrl) {
        webhookUrls.push(treatnoteUrl);
      }
    }

    if (webhookUrls.length === 0) {
      console.error(`No webhook URL configured for mode: ${mode}`);
      return new Response(
        JSON.stringify({ error: `No webhook URL configured for mode: ${mode}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward audio to all configured webhooks
    const sendPromises = webhookUrls.map(async (url) => {
      const webhookFormData = new FormData();
      // n8n expects binary data in a field called "data"
      webhookFormData.append("data", audio, finalFilename);
      webhookFormData.append("mode", mode);
      webhookFormData.append("timestamp", timestamp || new Date().toISOString());
      webhookFormData.append("user_id", userId || "");
      webhookFormData.append("company_id", companyId || "");
      webhookFormData.append("telephely_id", telephelyId || "");
      webhookFormData.append("flexi_username", flexiUsername);
      webhookFormData.append("flexi_pw", decryptedFlexiPw);

      console.log(`Sending audio to webhook: ${url}`);
      
      const response = await fetch(url, {
        method: "POST",
        body: webhookFormData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Webhook error (${url}):`, errorText);
        throw new Error(`Webhook failed: ${response.status}`);
      }

      return response;
    });

    await Promise.all(sendPromises);

    console.log("Voice recording forwarded successfully to all webhooks");

    return new Response(
      JSON.stringify({ success: true, message: "Voice recording forwarded successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in voice-recording-webhook function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
