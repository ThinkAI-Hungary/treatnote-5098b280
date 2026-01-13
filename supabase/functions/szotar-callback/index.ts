import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { telephely_id, user_id, content } = await req.json();

    if (!telephely_id) {
      throw new Error("Missing required field: telephely_id");
    }

    // Parse content - expect an array of strings or objects
    let parsedContent: string[] = [];
    
    if (Array.isArray(content)) {
      parsedContent = content.map(item => 
        typeof item === 'string' ? item : JSON.stringify(item)
      );
    } else if (typeof content === 'object' && content !== null) {
      // If it's an object, extract values or convert to array
      parsedContent = Object.values(content).map(item =>
        typeof item === 'string' ? item : JSON.stringify(item)
      );
    } else if (typeof content === 'string') {
      // Try to parse as JSON
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          parsedContent = parsed.map(item =>
            typeof item === 'string' ? item : JSON.stringify(item)
          );
        } else {
          parsedContent = [content];
        }
      } catch {
        parsedContent = [content];
      }
    }

    console.log('Parsed content:', parsedContent);

    // Check if szotar already exists for this telephely
    const { data: existing, error: fetchError } = await supabase
      .from('szotar')
      .select('id')
      .eq('telephely_id', telephely_id)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking existing szotar:', fetchError);
      throw fetchError;
    }

    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from('szotar')
        .update({
          content: parsedContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating szotar:', updateError);
        throw updateError;
      }

      console.log('Updated existing szotar:', existing.id);
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('szotar')
        .insert({
          telephely_id,
          content: parsedContent,
          created_by: user_id || '00000000-0000-0000-0000-000000000000',
        });

      if (insertError) {
        console.error('Error inserting szotar:', insertError);
        throw insertError;
      }

      console.log('Created new szotar for telephely:', telephely_id);
    }

    return new Response(
      JSON.stringify({ success: true, items_count: parsedContent.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
