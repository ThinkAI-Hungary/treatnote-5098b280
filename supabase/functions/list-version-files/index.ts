import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FileObject {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
    cacheControl?: string;
    [key: string]: any;
  };
}

// Recursive function to list all files in a directory
async function listAllFiles(
  supabase: any,
  bucket: string,
  prefix: string
): Promise<FileObject[]> {
  const allFiles: FileObject[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(prefix, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      throw new Error(`Storage error: ${error.message}`);
    }

    if (!files || files.length === 0) {
      break;
    }

    // Process each item - if it's a directory, recurse
    for (const file of files) {
      if (file.id === null) {
        // It's a directory/folder - recurse into it
        const folderPath = prefix ? `${prefix}/${file.name}` : file.name;
        const subFiles = await listAllFiles(supabase, bucket, folderPath);
        allFiles.push(...subFiles);
      } else {
        // It's a file - add full path
        allFiles.push({
          ...file,
          name: prefix ? `${prefix}/${file.name}` : file.name
        });
      }
    }

    // If we got less than limit, we're done
    if (files.length < limit) {
      break;
    }

    offset += limit;
  }

  return allFiles;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().substring(0, 8);

  try {
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

    // Verify JWT and get user
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

    console.log(`[${requestId}] Request from user ${user.id}`);

    // Get user's company FROM DATABASE (never trust client input)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, companies!inner(id, name, slug)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.log(`[${requestId}] NOT_FOUND: Profile not found - ${profileError?.message}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'NOT_FOUND', message: 'User profile not found' }
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    if (!profile.company_id) {
      console.log(`[${requestId}] NOT_FOUND: No company assigned to user`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'NOT_FOUND', message: 'No company assigned to user' }
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }}
      );
    }

    const companyName = (profile.companies as any).name;
    const companyId = (profile.companies as any).id;
    
    // SECURITY: Build version prefix from DB-sourced company name, NOT from client
    const versionPrefix = `Molaire/Voxis/Telephely/${companyName}/Version`;

    console.log(`[${requestId}] Listing files for company ${companyName} (${companyId}) at prefix: ${versionPrefix}/`);

    // Perform recursive listing
    const files = await listAllFiles(supabase, 'client-files', versionPrefix);

    console.log(`[${requestId}] Found ${files.length} files`);

    // Fetch file hashes for integrity verification
    const filePaths = files.map(f => f.name);
    
    let hashMap = new Map();
    if (filePaths.length > 0) {
      const { data: hashes, error: hashError } = await supabase
        .from('file_hashes')
        .select('path, sha256, size, version')
        .in('path', filePaths);

      if (hashError) {
        console.log(`[${requestId}] WARN: Failed to fetch file hashes - ${hashError.message}`);
      } else if (hashes) {
        hashMap = new Map(hashes.map((h: any) => [h.path, h]));
      }
    }

    // Enrich file data with hashes
    const enrichedFiles = files.map(file => {
      const hash = hashMap.get(file.name);
      return {
        name: file.name.replace(`${versionPrefix}/`, ''), // Remove prefix for cleaner response
        path: file.name, // Full path
        size: file.metadata?.size || hash?.size,
        updated_at: file.updated_at,
        sha256: hash?.sha256,
        version: hash?.version
      };
    });

    console.log(`[${requestId}] SUCCESS: Returning ${enrichedFiles.length} enriched files`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          files: enrichedFiles,
          prefix: versionPrefix,
          company_id: companyId,
          company_name: companyName
        }
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
