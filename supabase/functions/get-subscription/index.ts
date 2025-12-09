import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const DEPRECATION_DATE = '2025-03-01';

const ALLOWED_FIELDS = [
  'user_id', 'full_name', 'avatar_url', 'phone', 'company_name',
  'subscription_status', 'subscription_plan', 'subscription_start_date',
  'subscription_end_date', 'subscription_amount', 'company_id', 'telephely_id'
];

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

function hashUserId(userId: string): string {
  return userId.substring(0, 8) + '...';
}

function standardError(code: string, message: string, status: number, additionalHeaders?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: { code, message } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...additionalHeaders } }
  );
}

interface ProfileData {
  user_id?: string;
  full_name?: string;
  avatar_url?: string;
  phone?: string;
  company_name?: string;
  subscription_status?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  subscription_amount?: number;
  company_id?: string;
  telephely_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const email = url.searchParams.get('email');
    const fieldsParam = url.searchParams.get('fields');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const validApiKey = Deno.env.get('SUBSCRIPTION_API_KEY');

    const authHeader = req.headers.get('Authorization');
    const apiKeyHeader = req.headers.get('x-api-key');

    let authenticatedUserId: string | null = null;
    let isAdmin = false;
    let authMethod: 'jwt' | 'api_key' = 'jwt';

    if (authHeader?.startsWith('Bearer ')) {
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user) {
        return standardError('UNAUTHORIZED', 'Invalid or expired token', 401);
      }

      authenticatedUserId = user.id;

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: isAdminData } = await supabaseAdmin
        .rpc('has_role', { _user_id: user.id, _role: 'admin' });
      isAdmin = !!isAdminData;

    } else if (apiKeyHeader) {
      authMethod = 'api_key';

      if (!validApiKey || apiKeyHeader !== validApiKey) {
        return standardError('UNAUTHORIZED', 'Invalid API key', 401);
      }

      const deprecationWarning = `API key authentication is deprecated and will be removed after ${DEPRECATION_DATE}. Please migrate to JWT authentication.`;
      console.warn(`[${requestId}] ${deprecationWarning}`);

    } else {
      return standardError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const rateLimitKey = authenticatedUserId || apiKeyHeader || 'anonymous';
    if (!checkRateLimit(rateLimitKey)) {
      return standardError('RATE_LIMITED', 'Too many requests', 429);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let targetUserId = userId;
    if (email && !targetUserId) {
      const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers();
      const foundUser = authUsers?.users?.find(u => u.email === email);
      if (foundUser) {
        targetUserId = foundUser.id;
      }
    }

    if (!targetUserId && authenticatedUserId) {
      targetUserId = authenticatedUserId;
    }

    if (!targetUserId) {
      return standardError('BAD_REQUEST', 'userId or email parameter required', 400);
    }

    if (authMethod === 'jwt' && !isAdmin && targetUserId !== authenticatedUserId) {
      return standardError('FORBIDDEN', 'Access denied', 403);
    }

    let selectFields = ALLOWED_FIELDS;
    if (fieldsParam) {
      const requestedFields = fieldsParam.split(',').map(f => f.trim());
      selectFields = requestedFields.filter(f => ALLOWED_FIELDS.includes(f));
      if (selectFields.length === 0) {
        return standardError('BAD_REQUEST', 'No valid fields specified', 400);
      }
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(selectFields.join(','))
      .eq('user_id', targetUserId)
      .single();

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        return standardError('NOT_FOUND', 'User not found', 404);
      }
      throw profileError;
    }

    const profileData = profile as ProfileData;

    let companyData = null;
    if (profileData.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('name, slug')
        .eq('id', profileData.company_id)
        .single();
      companyData = company;
    }

    let appConfig = null;
    if (profileData.company_id) {
      const { data: config } = await supabaseAdmin
        .from('company_app_config')
        .select('min_required_version, enforce_mandatory_update')
        .eq('company_id', profileData.company_id)
        .single();
      appConfig = config;
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${authMethod} request for user ${hashUserId(targetUserId)} completed in ${duration}ms`);

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId
    };

    if (authMethod === 'api_key') {
      responseHeaders['X-Deprecation-Warning'] = `API key auth deprecated after ${DEPRECATION_DATE}`;
    }

    return new Response(
      JSON.stringify({
        ...profileData,
        company: companyData,
        app_config: appConfig
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return standardError('INTERNAL_ERROR', 'Internal server error', 500);
  }
});
