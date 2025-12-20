import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface KlinikaUser {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  telephely_name: string | null;
  subscription_status: string;
  role: string;
}

interface SentInvitation {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

interface KlinikaDataState {
  // Role data
  isAdmin: boolean;
  isKlinikaAdmin: boolean;
  companyId: string | null;
  companyName: string | null;
  telephelyId: string | null;
  telephelyName: string | null;
  // Users data
  users: KlinikaUser[];
  // Invitations data
  sentInvitations: SentInvitation[];
  // Loading state - single unified loading
  isLoading: boolean;
  // Error state
  error: string | null;
}

const initialState: KlinikaDataState = {
  isAdmin: false,
  isKlinikaAdmin: false,
  companyId: null,
  companyName: null,
  telephelyId: null,
  telephelyName: null,
  users: [],
  sentInvitations: [],
  isLoading: true,
  error: null,
};

// Helper to invoke edge function with retry on 401
async function invokeWithRetry<T>(
  operation: string,
  body: Record<string, unknown> = {},
  retries = 1
): Promise<{ data: T | null; error: Error | null }> {
  const fullBody = { operation, ...body };
  
  const { data, error } = await supabase.functions.invoke<T>('klinika-admin', { body: fullBody });
  
  // Check for 401 error (unauthorized) - retry after session refresh
  if (error && (error.message?.includes('401') || error.message?.includes('Unauthorized'))) {
    if (retries > 0) {
      console.log(`Got 401 for ${operation}, refreshing session and retrying...`);
      // Refresh the session
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        // Wait a brief moment for the new token to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        return invokeWithRetry<T>(operation, body, retries - 1);
      }
    }
  }
  
  return { data, error };
}

export function useKlinikaData() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<KlinikaDataState>(initialState);
  const fetchedRef = useRef(false);
  const mountedRef = useRef(true);

  // Parallel data fetch - no artificial delays
  const loadAllData = useCallback(async () => {
    if (!user) {
      setState({ ...initialState, isLoading: false });
      return;
    }

    try {
      // Step 1: Fetch roles first (we need them to determine access)
      const [adminResult, klinikaResult, profileResult] = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'klinika_admin' }),
        supabase.from('profiles').select('company_id, company_name, telephely_id').eq('user_id', user.id).single(),
      ]);

      const isAdmin = !!adminResult.data;
      const isKlinikaAdmin = !!klinikaResult.data;
      const hasAccess = isAdmin || isKlinikaAdmin;

      // Get telephely name if available
      let telephelyName: string | null = null;
      if (profileResult.data?.telephely_id) {
        const { data: telephely } = await supabase
          .from('telephely')
          .select('name')
          .eq('id', profileResult.data.telephely_id)
          .single();
        telephelyName = telephely?.name || null;
      }

      // If no access, return early with role data only
      if (!hasAccess) {
        if (mountedRef.current) {
          setState({
            ...initialState,
            isAdmin,
            isKlinikaAdmin,
            companyId: profileResult.data?.company_id || null,
            companyName: profileResult.data?.company_name || null,
            telephelyId: profileResult.data?.telephely_id || null,
            telephelyName,
            isLoading: false,
          });
        }
        return;
      }

      // Step 2: Fetch users and invitations in parallel with retry
      const [usersResponse, invitationsResponse] = await Promise.all([
        invokeWithRetry<{ users: KlinikaUser[] }>('get-users'),
        invokeWithRetry<{ invitations: SentInvitation[] }>('get-sent-invitations'),
      ]);

      if (mountedRef.current) {
        setState({
          isAdmin,
          isKlinikaAdmin,
          companyId: profileResult.data?.company_id || null,
          companyName: profileResult.data?.company_name || null,
          telephelyId: profileResult.data?.telephely_id || null,
          telephelyName,
          users: usersResponse.data?.users || [],
          sentInvitations: invitationsResponse.data?.invitations || [],
          isLoading: false,
          error: null,
        });
      }
    } catch (err: any) {
      console.error('Error loading klinika data:', err);
      if (mountedRef.current) {
        setState(prev => ({ ...prev, isLoading: false, error: err.message }));
      }
    }
  }, [user]);

  // Refresh users only (with retry)
  const refreshUsers = useCallback(async () => {
    try {
      const { data } = await invokeWithRetry<{ users: KlinikaUser[] }>('get-users');
      if (mountedRef.current) {
        setState(prev => ({ ...prev, users: data?.users || [] }));
      }
    } catch (err) {
      console.error('Error refreshing users:', err);
    }
  }, []);

  // Refresh invitations only (with retry)
  const refreshInvitations = useCallback(async () => {
    try {
      const { data } = await invokeWithRetry<{ invitations: SentInvitation[] }>('get-sent-invitations');
      if (mountedRef.current) {
        setState(prev => ({ ...prev, sentInvitations: data?.invitations || [] }));
      }
    } catch (err) {
      console.error('Error refreshing invitations:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    // Only fetch once per mount
    if (!authLoading && user && !fetchedRef.current) {
      fetchedRef.current = true;
      loadAllData();
    } else if (!authLoading && !user) {
      setState({ ...initialState, isLoading: false });
    }

    return () => {
      mountedRef.current = false;
      fetchedRef.current = false;
    };
  }, [authLoading, user, loadAllData]);

  return {
    ...state,
    refreshUsers,
    refreshInvitations,
    refreshAll: loadAllData,
  };
}
