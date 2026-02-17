import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabaseHelpers';
import { USERS_DATA_CHANGED } from '@/lib/userSyncEvents';

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
  role?: string;
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

export function useKlinikaData() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<KlinikaDataState>(initialState);
  const fetchedRef = useRef(false);
  const mountedRef = useRef(true);

  // Parallel data fetch - no artificial delays
  // Parallel data fetch - no artificial delays
  const loadAllData = useCallback(async () => {
    if (!user) {
      setState({ ...initialState, isLoading: false });
      return;
    }

    try {
      // Step 1: Fetch profile to identify the ACTIVE telephely context
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('company_id, company_name, telephely_id, current_telephely_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      // Determine active telephely - Prefer current_telephely_id, fallback to telephely_id
      let activeTelephelyId = profileData?.current_telephely_id || profileData?.telephely_id;

      console.log('useKlinikaData: Resolved activeTelephelyId:', activeTelephelyId);

      // Step 2: Determine permissions based on the ACTIVE telephely
      let isKlinikaAdmin = false;
      let isAdmin = false;

      // Always check admin role
      const adminResult = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      isAdmin = !!adminResult.data;

      if (activeTelephelyId) {
        // Check klinika membership for the active telephely
        const { data: membershipData } = await supabase
          .from('telephely_memberships')
          .select('role')
          .eq('user_id', user.id)
          .eq('telephely_id', activeTelephelyId)
          .eq('role', 'klinika_admin')
          .maybeSingle();

        isKlinikaAdmin = !!membershipData;
      } else {
        // No telephely in profile — check if user has ANY klinika_admin membership
        const { data: anyMembership } = await supabase
          .from('telephely_memberships')
          .select('role, telephely_id')
          .eq('user_id', user.id)
          .eq('role', 'klinika_admin')
          .limit(1)
          .maybeSingle();

        if (anyMembership) {
          isKlinikaAdmin = true;
          activeTelephelyId = anyMembership.telephely_id;
        }
      }

      const hasAccess = isAdmin || isKlinikaAdmin;

      // Get telephely name and resolve company
      let telephelyName: string | null = null;
      let resolvedCompanyId = profileData?.company_id || null;
      let resolvedCompanyName = profileData?.company_name || null;

      if (activeTelephelyId) {
        const { data: telephely } = await supabase
          .from('telephely')
          .select('name, company_id')
          .eq('id', activeTelephelyId)
          .single();
        telephelyName = telephely?.name || null;

        // Resolve company from telephely if profile doesn't have it
        if (!resolvedCompanyId && telephely?.company_id) {
          resolvedCompanyId = telephely.company_id;
          const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('id', telephely.company_id)
            .single();
          resolvedCompanyName = company?.name || null;
        }
      }

      // If no access, return early with role data only
      if (!hasAccess) {
        if (mountedRef.current) {
          setState({
            ...initialState,
            isAdmin,
            isKlinikaAdmin,
            companyId: resolvedCompanyId,
            companyName: resolvedCompanyName,
            telephelyId: activeTelephelyId || null,
            telephelyName,
            isLoading: false,
          });
        }
        return;
      }

      // Step 3: Fetch users and invitations
      // Note: The edge function should respect the user's current_telephely_id context implicitly
      const [usersResponse, invitationsResponse] = await Promise.all([
        invokeWithRetry<{ users: KlinikaUser[] }>('klinika-admin', { operation: 'get-users' }),
        invokeWithRetry<{ invitations: SentInvitation[] }>('klinika-admin', { operation: 'get-sent-invitations' }),
      ]);

      if (mountedRef.current) {
        setState({
          isAdmin,
          isKlinikaAdmin,
          companyId: resolvedCompanyId,
          companyName: resolvedCompanyName,
          telephelyId: activeTelephelyId || null,
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
      const { data } = await invokeWithRetry<{ users: KlinikaUser[] }>('klinika-admin', { operation: 'get-users' });
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
      const { data } = await invokeWithRetry<{ invitations: SentInvitation[] }>('klinika-admin', { operation: 'get-sent-invitations' });
      if (mountedRef.current) {
        setState(prev => ({ ...prev, sentInvitations: data?.invitations || [] }));
      }
    } catch (err) {
      console.error('Error refreshing invitations:', err);
    }
  }, []);

  // Same-tab sync (e.g., deletions triggered from the Admin File Manager tab)
  // Listen for the event only after we've loaded and we have access
  const hasAccess = state.isAdmin || state.isKlinikaAdmin;
  const hasAccessRef = useRef(hasAccess);
  hasAccessRef.current = hasAccess;

  useEffect(() => {
    const handleUsersChanged = () => {
      if (hasAccessRef.current) {
        refreshUsers();
        refreshInvitations();
      }
    };

    window.addEventListener(USERS_DATA_CHANGED, handleUsersChanged);
    return () => window.removeEventListener(USERS_DATA_CHANGED, handleUsersChanged);
  }, [refreshUsers, refreshInvitations]);

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
