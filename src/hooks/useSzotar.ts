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
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useSzotar(): UseSzotarReturn {
  const { profile, loading: profileLoading } = useProfile();
  const [szotar, setSzotar] = useState<SzotarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSzotar = useCallback(async () => {
    if (!profile?.telephely_id) {
      setSzotar(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('szotar')
        .select('*')
        .eq('telephely_id', profile.telephely_id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching szotar:', error);
        setSzotar(null);
      } else if (data) {
        // Parse content as array
        const content = Array.isArray(data.content) 
          ? data.content 
          : typeof data.content === 'string' 
            ? [data.content]
            : [];
        setSzotar({
          ...data,
          content: content as string[],
        });
      } else {
        setSzotar(null);
      }
    } catch (err) {
      console.error('Error fetching szotar:', err);
      setSzotar(null);
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
    isLoading: isLoading || profileLoading,
    refresh: fetchSzotar,
  };
}
