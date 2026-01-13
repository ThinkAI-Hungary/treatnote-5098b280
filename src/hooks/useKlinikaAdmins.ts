import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';

interface KlinikaAdmin {
  id: string;
  full_name: string | null;
  phone: string | null;
}

interface UseKlinikaAdminsReturn {
  admins: KlinikaAdmin[];
  isLoading: boolean;
}

export function useKlinikaAdmins(): UseKlinikaAdminsReturn {
  const { profile, loading: profileLoading } = useProfile();
  const [admins, setAdmins] = useState<KlinikaAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchAdmins() {
      if (!profile?.telephely_id) {
        setAdmins([]);
        setIsLoading(false);
        return;
      }

      try {
        // Use edge function to fetch klinika admins (bypasses RLS)
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) {
          console.error('No access token available');
          setAdmins([]);
          setIsLoading(false);
          return;
        }

        const response = await supabase.functions.invoke('get-klinika-admins', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.error) {
          console.error('Error fetching klinika admins:', response.error);
          setAdmins([]);
          setIsLoading(false);
          return;
        }

        const adminList: KlinikaAdmin[] = response.data?.admins || [];
        console.log('Fetched klinika admins:', adminList);
        setAdmins(adminList);
      } catch (err) {
        console.error('Error fetching klinika admins:', err);
        setAdmins([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (!profileLoading) {
      fetchAdmins();
    }
  }, [profile?.telephely_id, profileLoading]);

  return { admins, isLoading };
}
