import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
    
    // Get the requesting user from the JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with anon key to verify the requesting user
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is admin using the has_role function
    const { data: isAdminData, error: adminCheckError } = await supabaseAdmin
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (adminCheckError || !isAdminData) {
      console.error('Admin check failed:', adminCheckError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the userId from request body
    const { userId } = await req.json();
    if (!userId) {
      console.error('No userId provided');
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} attempting to delete user ${userId}`);

    // Get the user's profile info for folder deletion
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, company_id, telephely_id')
      .eq('user_id', userId)
      .single();

    // Check the target user's role (optional - user might not have a role)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (roleError) {
      console.error('Error fetching user role:', roleError);
      // Continue anyway - we'll still try to delete the user
    }

    const targetRole = roleData?.role || 'unknown';
    console.log(`Target user ${userId} has role: ${targetRole}`);

    // Delete user's folder from storage if they had a company and telephely
    if (targetProfile?.company_id && targetProfile?.telephely_id) {
      try {
        // Get company and telephely names
        const [companyResult, telephelyResult] = await Promise.all([
          supabaseAdmin.from('companies').select('name').eq('id', targetProfile.company_id).single(),
          supabaseAdmin.from('telephely').select('name').eq('id', targetProfile.telephely_id).single(),
        ]);

        if (companyResult.data?.name && telephelyResult.data?.name) {
          // Sanitize path by converting Hungarian/special characters to ASCII equivalents
          // KEEP SPACES (don't convert to underscores) - must match admin-file-manager sanitization
          const charMap: Record<string, string> = {
            'á': 'a', 'Á': 'A', 'é': 'e', 'É': 'E', 'í': 'i', 'Í': 'I',
            'ó': 'o', 'Ó': 'O', 'ö': 'o', 'Ö': 'O', 'ő': 'o', 'Ő': 'O',
            'ú': 'u', 'Ú': 'U', 'ü': 'u', 'Ü': 'U', 'ű': 'u', 'Ű': 'U',
          };
          const sanitize = (str: string) => str.split('').map(char => charMap[char] || char).join('').replace(/\s+/g, ' ').trim();

          // Get user's auth email for folder name
          const { data: { users: authUsersList } } = await supabaseAdmin.auth.admin.listUsers();
          const targetAuthUser = authUsersList?.find(u => u.id === userId);
          const userName = targetProfile.full_name || targetAuthUser?.email?.split('@')[0] || userId;

          const sanitizedCompany = sanitize(companyResult.data.name);
          const sanitizedTelephely = sanitize(telephelyResult.data.name);
          const sanitizedUser = sanitize(userName);
          
          const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/${sanitizedUser}`;
          
          console.log(`Deleting user folder: ${folderPath}`);
          
          // List all files in the user's folder
          const { data: files, error: listError } = await supabaseAdmin.storage
            .from('client-files')
            .list(folderPath, { limit: 1000 });

          if (listError) {
            console.error('Error listing user folder:', listError);
          } else if (files && files.length > 0) {
            // Delete all files in the folder
            const filePaths = files.map(f => `${folderPath}/${f.name}`);
            const { error: deleteFilesError } = await supabaseAdmin.storage
              .from('client-files')
              .remove(filePaths);

            if (deleteFilesError) {
              console.error('Error deleting user files:', deleteFilesError);
            } else {
              console.log(`Deleted ${filePaths.length} files from user folder`);
            }
          } else {
            console.log(`No files found in user folder: ${folderPath}`);
          }
        }
      } catch (folderError) {
        console.error('Error deleting user folder:', folderError);
        // Continue with user deletion even if folder deletion fails
      }
    }

    // Delete related data first (no cascade from auth.users)
    console.log(`Deleting related data for user ${userId}...`);
    
    // Delete from folder_access
    const { error: folderAccessError } = await supabaseAdmin
      .from('folder_access')
      .delete()
      .eq('user_id', userId);
    if (folderAccessError) {
      console.error('Error deleting folder_access:', folderAccessError);
    }

    // Delete from user_roles
    const { error: rolesDeleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    if (rolesDeleteError) {
      console.error('Error deleting user_roles:', rolesDeleteError);
    }

    // Delete from profiles
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);
    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
    }

    // Delete from auth.users
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`User ${userId} (role: ${targetRole}) fully deleted from all tables and storage`);
    return new Response(
      JSON.stringify({ success: true, message: 'User deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
