// Hook for fetching and managing szotar and szotar_kezelesek data
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { subscribeToTelephelyChanges } from '@/lib/telephelyEvents';
import { subscribeToSzotarChanges } from '@/lib/szotarEvents';

interface SzotarData {
  id: string;
  telephely_id: string;
  content: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface SzotarKezelesData {
  id: string;
  telephely_id: string;
  name: string;
  category: string | null;
  created_at: string;
  updated_at: string;
}

interface UseSzotarReturn {
  szotar: SzotarData | null;
  szotarKezelesek: SzotarKezelesData[];
  hasSzotar: boolean;
  hasProbaPaciens: boolean;
  probaPaciensNeve: string | null;
  hasFlexiDomain: boolean;
  flexiDomain: string | null;
  hasMappings: boolean;
  unreviewedMappingsCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  startPolling: () => void;
}

// Module-level cache so data persists across component mounts
let szotarCache: {
  telephelyId: string | null;
  szotar: SzotarData | null;
  szotarKezelesek: SzotarKezelesData[];
  probaPaciensNeve: string | null;
  flexiDomain: string | null;
  loaded: boolean;
} = {
  telephelyId: null,
  szotar: null,
  szotarKezelesek: [],
  probaPaciensNeve: null,
  hasMappings: false,
  unreviewedMappingsCount: 0,
  loaded: false,
};

export function useSzotar(): UseSzotarReturn {
  const { profile, loading: profileLoading } = useProfile();
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;

  // Invalidate cache if telephely changed
  if (activeTelephelyId !== szotarCache.telephelyId) {
    szotarCache = { telephelyId: activeTelephelyId, szotar: null, szotarKezelesek: [], probaPaciensNeve: null, flexiDomain: null, hasMappings: false, unreviewedMappingsCount: 0, loaded: false };
  }

  const hasCachedData = szotarCache.loaded && szotarCache.telephelyId === activeTelephelyId;
  const [szotar, setSzotar] = useState<SzotarData | null>(hasCachedData ? szotarCache.szotar : null);
  const [szotarKezelesek, setSzotarKezelesek] = useState<SzotarKezelesData[]>(hasCachedData ? szotarCache.szotarKezelesek : []);
  const [probaPaciensNeve, setProbaPaciensNeve] = useState<string | null>(hasCachedData ? szotarCache.probaPaciensNeve : null);
  const [flexiDomain, setFlexiDomain] = useState<string | null>(hasCachedData ? szotarCache.flexiDomain : null);
  const [hasMappings, setHasMappings] = useState<boolean>(hasCachedData ? szotarCache.hasMappings : false);
  const [unreviewedMappingsCount, setUnreviewedMappingsCount] = useState<number>(hasCachedData ? szotarCache.unreviewedMappingsCount : 0);
  const [isLoading, setIsLoading] = useState(!hasCachedData);

  // Debounce ref to prevent multiple rapid fetches
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling fallback (when realtime doesn't fire) - short aggressive window
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSzotar = useCallback(async () => {
    // Prefer current_telephely_id, fallback to telephely_id
    const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;

    if (!activeTelephelyId) {
      setSzotar(null);
      setSzotarKezelesek([]);
      setProbaPaciensNeve(null);
      setFlexiDomain(null);
      setHasMappings(false);
      setUnreviewedMappingsCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch szotar, szotar_kezelesek, telephely, and mappings data in parallel
      const [szotarResult, kezelesekResult, telephelyResult, mappingsRes] = await Promise.all([
        supabase
          .from('szotar')
          .select('*')
          .eq('telephely_id', activeTelephelyId)
          .maybeSingle(),
        supabase
          .from('szotar_kezelesek')
          .select('*')
          .eq('telephely_id', activeTelephelyId)
          .order('category', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase
          .from('telephely')
          .select('probapaciens_neve, flexi_domain')
          .eq('id', activeTelephelyId)
          .maybeSingle(),
        supabase
          .from('v2_clinic_mappings')
          .select('id, reviewed')
          .eq('telephely_id', activeTelephelyId),
      ]);

      if (szotarResult.error) {
        console.error('Error fetching szotar:', szotarResult.error);
        setSzotar(null);
      } else if (szotarResult.data) {
        // Parse content as array
        const content = Array.isArray(szotarResult.data.content)
          ? szotarResult.data.content
          : typeof szotarResult.data.content === 'string'
            ? [szotarResult.data.content]
            : [];
        setSzotar({
          ...szotarResult.data,
          content: content as string[],
        });
      } else {
        setSzotar(null);
      }

      if (kezelesekResult.error) {
        console.error('Error fetching szotar_kezelesek:', kezelesekResult.error);
        setSzotarKezelesek([]);
      } else {
        console.log('useSzotar: Loaded', kezelesekResult.data?.length || 0, 'szotar_kezelesek');
        setSzotarKezelesek(kezelesekResult.data || []);
      }

      if (telephelyResult.error) {
        console.error('Error fetching telephely:', telephelyResult.error);
        setProbaPaciensNeve(null);
        setFlexiDomain(null);
      } else {
        setProbaPaciensNeve(telephelyResult.data?.probapaciens_neve || null);
        setFlexiDomain(telephelyResult.data?.flexi_domain || null);
      }
      
      if (mappingsRes?.error) {
        console.error('Error fetching v2 mappings:', mappingsRes.error);
        setHasMappings(false);
        setUnreviewedMappingsCount(0);
      } else if (mappingsRes?.data) {
        setHasMappings(mappingsRes.data.length > 0);
        setUnreviewedMappingsCount(mappingsRes.data.filter((m: any) => !m.reviewed).length);
      } else {
        setHasMappings(false);
        setUnreviewedMappingsCount(0);
      }
      // Update module-level cache
      szotarCache = {
        telephelyId: activeTelephelyId,
        szotar: szotarResult.error ? null : (szotarResult.data ? {
          ...szotarResult.data,
          content: Array.isArray(szotarResult.data.content)
            ? szotarResult.data.content as string[]
            : typeof szotarResult.data.content === 'string'
              ? [szotarResult.data.content]
              : [],
        } : null),
        szotarKezelesek: kezelesekResult.error ? [] : (kezelesekResult.data || []),
        probaPaciensNeve: telephelyResult.error ? null : (telephelyResult.data?.probapaciens_neve || null),
        flexiDomain: telephelyResult.error ? null : (telephelyResult.data?.flexi_domain || null),
        hasMappings: mappingsRes?.error ? false : ((mappingsRes?.data?.length || 0) > 0),
        unreviewedMappingsCount: mappingsRes?.error ? 0 : (mappingsRes?.data?.filter((m: any) => !m.reviewed).length || 0),
        loaded: true,
      };
    } catch (err) {
      console.error('Error fetching szotar:', err);
      setSzotar(null);
      setSzotarKezelesek([]);
      setProbaPaciensNeve(null);
      setFlexiDomain(null);
    } finally {
      setIsLoading(false);
    }
  }, [(profile as any)?.current_telephely_id, profile?.telephely_id]);


  // Debounced fetch to handle multiple rapid realtime events
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      console.log('useSzotar: Debounced fetch triggered');
      fetchSzotar();
    }, 500); // Wait 500ms after last event before fetching
  }, [fetchSzotar]);

  const stopAggressivePolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (pollStopTimeoutRef.current) {
      clearTimeout(pollStopTimeoutRef.current);
      pollStopTimeoutRef.current = null;
    }
  }, []);

  const startAggressivePolling = useCallback(() => {
    // Restart the 2-minute aggressive polling window
    stopAggressivePolling();

    // Immediate fetch, then keep polling
    fetchSzotar();

    pollIntervalRef.current = setInterval(() => {
      fetchSzotar();
    }, 3000);

    pollStopTimeoutRef.current = setTimeout(() => {
      stopAggressivePolling();
    }, 120000);
  }, [fetchSzotar, stopAggressivePolling]);

  useEffect(() => {
    if (!profileLoading) {
      fetchSzotar();
    }
  }, [profileLoading, fetchSzotar]);

  // Listen for telephely data changes
  useEffect(() => {
    const unsubscribe = subscribeToTelephelyChanges(() => {
      fetchSzotar();
    });
    return unsubscribe;
  }, [fetchSzotar]);

  // Force-refresh consumers (e.g. sidebar) when other screens detect szótár changes
  useEffect(() => {
    const unsubscribe = subscribeToSzotarChanges(() => {
      // Just do a single fetch. Aggressive polling on every broadcast causes an infinite loop
      // if the broadcaster is reacting to its own data loads.
      fetchSzotar();
    });
    return unsubscribe;
  }, [fetchSzotar]);

  // Real-time subscription for szotar and szotar_kezelesek changes
  useEffect(() => {
    // Prefer current_telephely_id, fallback to telephely_id
    const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;
    if (!activeTelephelyId) return;

    console.log('useSzotar: Setting up realtime subscriptions for telephely:', activeTelephelyId);

    const szotarChannel = supabase
      .channel(`szotar_hook_${activeTelephelyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'szotar',
          filter: `telephely_id=eq.${activeTelephelyId}`,
        },
        (payload) => {
          console.log('useSzotar: Szotar realtime update detected', payload.eventType);
          debouncedFetch();
        }
      )
      .subscribe((status) => {
        console.log('useSzotar: Szotar channel status:', status);
      });

    const kezelesekChannel = supabase
      .channel(`szotar_kezelesek_hook_${activeTelephelyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'szotar_kezelesek',
          filter: `telephely_id=eq.${activeTelephelyId}`,
        },
        (payload) => {
          console.log('useSzotar: Szotar kezelesek realtime update detected', payload.eventType);
          debouncedFetch();
        }
      )
      .subscribe((status) => {
        console.log('useSzotar: Szotar kezelesek channel status:', status);
      });

    const mappingsChannel = supabase
      .channel(`v2_clinic_mappings_hook_${activeTelephelyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'v2_clinic_mappings',
          filter: `telephely_id=eq.${activeTelephelyId}`,
        },
        (payload) => {
          console.log('useSzotar: v2_clinic_mappings realtime update detected', payload.eventType);
          debouncedFetch();
        }
      )
      .subscribe((status) => {
        console.log('useSzotar: v2_clinic_mappings channel status:', status);
      });

    return () => {
      console.log('useSzotar: Cleaning up realtime subscriptions');
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      stopAggressivePolling();
      supabase.removeChannel(szotarChannel);
      supabase.removeChannel(kezelesekChannel);
      supabase.removeChannel(mappingsChannel);
    };
  }, [(profile as any)?.current_telephely_id, profile?.telephely_id, debouncedFetch]);

  useEffect(() => {
    if (szotarKezelesek.length > 0) {
      stopAggressivePolling();
    }
  }, [szotarKezelesek.length, stopAggressivePolling]);

  return {
    szotar,
    szotarKezelesek,
    hasSzotar: szotarKezelesek.length > 0,
    hasProbaPaciens: !!probaPaciensNeve,
    probaPaciensNeve,
    hasFlexiDomain: !!flexiDomain,
    flexiDomain,
    hasMappings,
    unreviewedMappingsCount,
    isLoading: isLoading || profileLoading,
    refresh: fetchSzotar,
    startPolling: startAggressivePolling,
  };
}
