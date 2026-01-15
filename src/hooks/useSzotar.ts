// Hook for fetching and managing szotar and szotar_kezelesek data
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { subscribeToTelephelyChanges } from '@/lib/telephelyEvents';

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
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useSzotar(): UseSzotarReturn {
  const { profile, loading: profileLoading } = useProfile();
  const [szotar, setSzotar] = useState<SzotarData | null>(null);
  const [szotarKezelesek, setSzotarKezelesek] = useState<SzotarKezelesData[]>([]);
  const [probaPaciensNeve, setProbaPaciensNeve] = useState<string | null>(null);
  const [flexiDomain, setFlexiDomain] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSzotar = useCallback(async () => {
    if (!profile?.telephely_id) {
      setSzotar(null);
      setSzotarKezelesek([]);
      setProbaPaciensNeve(null);
      setFlexiDomain(null);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch szotar, szotar_kezelesek and telephely data in parallel
      const [szotarResult, kezelesekResult, telephelyResult] = await Promise.all([
        supabase
          .from('szotar')
          .select('*')
          .eq('telephely_id', profile.telephely_id)
          .maybeSingle(),
        supabase
          .from('szotar_kezelesek')
          .select('*')
          .eq('telephely_id', profile.telephely_id)
          .order('category', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true }),
        supabase
          .from('telephely')
          .select('probapaciens_neve, flexi_domain')
          .eq('id', profile.telephely_id)
          .maybeSingle(),
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
    } catch (err) {
      console.error('Error fetching szotar:', err);
      setSzotar(null);
      setSzotarKezelesek([]);
      setProbaPaciensNeve(null);
      setFlexiDomain(null);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.telephely_id]);

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

  // Real-time subscription for szotar and szotar_kezelesek changes
  useEffect(() => {
    if (!profile?.telephely_id) return;

    const szotarChannel = supabase
      .channel(`szotar_hook_${profile.telephely_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'szotar',
          filter: `telephely_id=eq.${profile.telephely_id}`,
        },
        () => {
          console.log('Szotar realtime update detected');
          fetchSzotar();
        }
      )
      .subscribe();

    const kezelesekChannel = supabase
      .channel(`szotar_kezelesek_hook_${profile.telephely_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'szotar_kezelesek',
          filter: `telephely_id=eq.${profile.telephely_id}`,
        },
        () => {
          console.log('Szotar kezelesek realtime update detected');
          fetchSzotar();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(szotarChannel);
      supabase.removeChannel(kezelesekChannel);
    };
  }, [profile?.telephely_id, fetchSzotar]);

  return {
    szotar,
    szotarKezelesek,
    hasSzotar: szotarKezelesek.length > 0,
    hasProbaPaciens: !!probaPaciensNeve,
    probaPaciensNeve,
    hasFlexiDomain: !!flexiDomain,
    flexiDomain,
    isLoading: isLoading || profileLoading,
    refresh: fetchSzotar,
  };
}
