import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path');

    if (!path) {
      console.log(`[${requestId}] BAD_REQUEST: Missing path parameter`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'BAD_REQUEST', message: 'path parameter required' }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    // Auth check
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log(`[${requestId}] UNAUTHORIZED: Missing authorization header`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    const token = authHeader.substring(7);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.log(`[${requestId}] UNAUTHORIZED: Invalid token - ${authError?.message}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'UNAUTHORIZED', message: 'Invalid token' }
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    console.log(`[${requestId}] Request from user ${user.id} for path: ${path}`);

    // SECURITY: Verify user has access to this path
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id, companies!inner(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile || !profile.company_id) {
      console.log(`[${requestId}] FORBIDDEN: User has no company`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'FORBIDDEN', message: 'User not associated with a company' }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    const companyName = (profile.companies as any).name;
    const expectedPrefix = `Molaire/Voxis/Telephely/${companyName}/Version/`;

    // SECURITY: Ensure requested path belongs to user's company
    if (!path.startsWith(expectedPrefix)) {
      console.log(`[${requestId}] FORBIDDEN: Path ${path} does not match company ${companyName}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { 
            code: 'FORBIDDEN', 
            message: 'You do not have access to this file' 
          }
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    // Get file hash
    const { data: hash, error } = await supabase
      .from('file_hashes')
      .select('*')
      .eq('path', path)
      .maybeSingle();

    if (error) {
      console.log(`[${requestId}] ERROR: Failed to fetch file hash - ${error.message}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { 
            code: 'INTERNAL_ERROR', 
            message: 'Failed to retrieve file metadata' 
          }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    if (!hash) {
      console.log(`[${requestId}] NOT_FOUND: No metadata for path ${path}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'NOT_FOUND', message: 'File metadata not found' }
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    console.log(`[${requestId}] SUCCESS: Returning metadata for ${path}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: hash
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
    );

  } catch (error) {
    console.error(`[${requestId}] INTERNAL_ERROR:`, error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: error instanceof Error ? error.message : 'An unexpected error occurred' 
        }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
    );
  }
});
