import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface CachedRolesData {
  isAdmin: boolean;
  isKlinikaAdmin: boolean;
  companyId: string | null;
  companyName: string | null;
  telephelyId: string | null;
  telephelyName: string | null;
  loading: boolean;
  isInitialized: boolean;
}

// Session-based cache - only valid for navigation within the same page session
// Uses a session key that changes on page refresh
const SESSION_KEY = `role_cache_${Date.now()}`;

const roleCache: {
  sessionKey: string;
  userId: string | null;
  data: Omit<CachedRolesData, 'loading' | 'isInitialized'> | null;
} = {
  sessionKey: SESSION_KEY,
  userId: null,
  data: null,
};

export function useCachedRoles(): CachedRolesData {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Omit<CachedRolesData, 'loading' | 'isInitialized'>>({
    isAdmin: false,
    isKlinikaAdmin: false,
    companyId: null,
    companyName: null,
    telephelyId: null,
    telephelyName: null,
  });
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Only use cache if it's from the same page session AND same user
    const cacheIsValid = roleCache.sessionKey === SESSION_KEY &&
      roleCache.userId === user?.id &&
      roleCache.data !== null;

    if (user && cacheIsValid) {
      setData(roleCache.data!);
      setLoading(false);
      setIsInitialized(true);
      return;
    }

    async function loadRoles() {
      if (!user) {
        const emptyData = {
          isAdmin: false,
          isKlinikaAdmin: false,
          companyId: null,
          companyName: null,
          telephelyId: null,
          telephelyName: null,
        };
        setData(emptyData);
        roleCache.userId = null;
        roleCache.data = null;
        setLoading(false);
        setIsInitialized(true);
        return;
      }

      // Prevent duplicate fetches within the same render cycle
      if (fetchedRef.current) return;
      fetchedRef.current = true;

      try {
        // Fetch roles and profile in parallel
        // We need to fetch basic profile first to know current_telephely_id, or fetch it all together.
        // We'll fetch profile and global admin role.
        const [adminResult, profileResult] = await Promise.all([
          supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
          supabase.from('profiles')
            .select('company_id, company_name, telephely_id, current_telephely_id')
            .eq('user_id', user.id)
            .single(),
        ]);

        const profileData = profileResult.data;
        // Determine effective telephely ID (current > legacy > null)
        const effectiveTelephelyId = profileData?.current_telephely_id || profileData?.telephely_id || null;

        // Fetch telephely details
        let telephelyName: string | null = null;
        let isKlinikaAdmin = false;

        if (effectiveTelephelyId) {
          // Fetch name and membership role in parallel
          const [telephelyRes, membershipRes] = await Promise.all([
            supabase.from('telephely').select('name').eq('id', effectiveTelephelyId).single(),
            supabase.from('telephely_memberships')
              .select('role')
              .eq('user_id', user.id)
              .eq('telephely_id', effectiveTelephelyId)
              .maybeSingle()
          ]);

          telephelyName = telephelyRes.data?.name || null;
          // Check if role is klinika_admin
          isKlinikaAdmin = membershipRes.data?.role === 'klinika_admin';

          // Fallback for legacy compatibility if no membership record exists yet (during migration phase)
          // strict check: if membershipRes.data is null, they might use legacy rights?
          // For safety, if no membership found, assume NO access or check legacy has_role?
          // Let's assume migration has populated memberships or we fallback to legacy has_role if membership missing.
          if (!membershipRes.data) {
            const legacyRoleCheck = await supabase.rpc('has_role', { _user_id: user.id, _role: 'klinika_admin' });
            if (legacyRoleCheck.data) isKlinikaAdmin = true;
          }
        }

        const newData = {
          isAdmin: !!adminResult.data,
          isKlinikaAdmin: isKlinikaAdmin,
          companyId: profileData?.company_id || null,
          companyName: profileData?.company_name || null,
          telephelyId: effectiveTelephelyId,
          telephelyName,
        };

        // Cache the data with current session key
        roleCache.sessionKey = SESSION_KEY;
        roleCache.userId = user.id;
        roleCache.data = newData;

        setData(newData);
      } catch (err) {
        console.error('Error loading roles:', err);
      } finally {
        setLoading(false);
        setIsInitialized(true);
      }
    }

    if (!authLoading) {
      loadRoles();
    }

    return () => {
      fetchedRef.current = false;
    };
  }, [user, authLoading]);

  return { ...data, loading: loading || authLoading, isInitialized };
}

// Clear cache on logout
export function clearRoleCache() {
  roleCache.userId = null;
  roleCache.data = null;
}
