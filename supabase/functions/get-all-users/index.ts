import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      console.error('Missing authorization token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader! },
        },
      }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authenticated user by explicitly passing the token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabaseClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users from auth.users using admin client
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get profiles data
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, full_name, company_name, company_id, telephely_id, subscription_status, subscription_plan, subscription_amount, subscription_end_date, can_create_users');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    // Get all companies
    const { data: companies, error: companiesError } = await supabaseAdmin
      .from('companies')
      .select('id, name, slug, telephely')
      .order('name');

    if (companiesError) {
      console.error('Error fetching companies:', companiesError);
    }

    // Get all telephely
    const { data: telephelyek, error: telephelyError } = await supabaseAdmin
      .from('telephely')
      .select('id, name, company_id')
      .order('name');

    if (telephelyError) {
      console.error('Error fetching telephely:', telephelyError);
    }

    // Get user roles
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
    }

    // Get flexi connections
    const { data: flexiConnections, error: flexiError } = await supabaseAdmin
      .from('flexi_auth')
      .select('user_id, flexi_username');

    if (flexiError) {
      console.error('Error fetching flexi connections:', flexiError);
    }

    // Combine all data and filter only confirmed users
    const combinedUsers = authUsers.users
      .filter(authUser => authUser.email_confirmed_at !== null)
      .map(authUser => {
        const profile = profiles?.find(p => p.user_id === authUser.id);
        const roleData = userRoles?.find(r => r.user_id === authUser.id);
        const flexiData = flexiConnections?.find(f => f.user_id === authUser.id);

        const userTelephely = telephelyek?.find(t => t.id === profile?.telephely_id);

        return {
          user_id: authUser.id,
          email: authUser.email,
          email_confirmed_at: authUser.email_confirmed_at,
          last_sign_in_at: authUser.last_sign_in_at,
          created_at: authUser.created_at,
          full_name: profile?.full_name || null,
          company_name: profile?.company_name || null,
          company_id: profile?.company_id || null,
          telephely_id: profile?.telephely_id || null,
          telephely_name: userTelephely?.name || null,
          role: roleData?.role || 'user',
          subscription_status: profile?.subscription_status || 'inactive',
          subscription_plan: profile?.subscription_plan || null,
          subscription_amount: profile?.subscription_amount || null,
          subscription_end_date: profile?.subscription_end_date || null,
          can_create_users: profile?.can_create_users || false,
          flexi_username: flexiData?.flexi_username || null,
        };
      });

    console.log(`Successfully fetched ${combinedUsers.length} users`);

    return new Response(
      JSON.stringify({ users: combinedUsers, companies: companies || [], telephelyek: telephelyek || [] }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error in get-all-users function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
