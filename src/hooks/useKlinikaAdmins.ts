import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';

interface KlinikaAdmin {
  id: string;
  email: string;
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
        // Get users who have klinika_admin role and are in the same telephely
        const { data: klinikaAdminRoles, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'klinika_admin');

        if (rolesError) {
          console.error('Error fetching klinika admin roles:', rolesError);
          setAdmins([]);
          setIsLoading(false);
          return;
        }

        if (!klinikaAdminRoles || klinikaAdminRoles.length === 0) {
          setAdmins([]);
          setIsLoading(false);
          return;
        }

        const adminUserIds = klinikaAdminRoles.map(r => r.user_id);

        // Get profiles for those users that are in the same telephely
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone')
          .eq('telephely_id', profile.telephely_id)
          .in('user_id', adminUserIds);

        if (profilesError) {
          console.error('Error fetching admin profiles:', profilesError);
          setAdmins([]);
          setIsLoading(false);
          return;
        }

        // We can't directly get emails from auth.users, but we can use the user_id
        // For now, we'll just show the full name and phone
        const adminList: KlinikaAdmin[] = (profiles || []).map(p => ({
          id: p.user_id,
          email: '', // Can't fetch from client side
          full_name: p.full_name,
          phone: p.phone,
        }));

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
