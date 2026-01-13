import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';

interface SzotarData {
  id: string;
  telephely_id: string;
  content: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface UseSzotarReturn {
  szotar: SzotarData | null;
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
  const [probaPaciensNeve, setProbaPaciensNeve] = useState<string | null>(null);
  const [flexiDomain, setFlexiDomain] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSzotar = useCallback(async () => {
    if (!profile?.telephely_id) {
      setSzotar(null);
      setProbaPaciensNeve(null);
      setFlexiDomain(null);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch both szotar and telephely data in parallel
      const [szotarResult, telephelyResult] = await Promise.all([
        supabase
          .from('szotar')
          .select('*')
          .eq('telephely_id', profile.telephely_id)
          .maybeSingle(),
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

  return {
    szotar,
    hasSzotar: szotar !== null,
    hasProbaPaciens: !!probaPaciensNeve,
    probaPaciensNeve,
    hasFlexiDomain: !!flexiDomain,
    flexiDomain,
    isLoading: isLoading || profileLoading,
    refresh: fetchSzotar,
  };
}
