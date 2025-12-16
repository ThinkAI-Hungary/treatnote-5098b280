import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface KlinikaAdminData {
  isKlinikaAdmin: boolean;
  companyId: string | null;
  companyName: string | null;
  telephelyId: string | null;
  telephelyName: string | null;
  loading: boolean;
}

export function useKlinikaAdminRole(): KlinikaAdminData {
  const { user } = useAuth();
  const [isKlinikaAdmin, setIsKlinikaAdmin] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [telephelyId, setTelephelyId] = useState<string | null>(null);
  const [telephelyName, setTelephelyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkRole() {
      if (!user) {
        setIsKlinikaAdmin(false);
        setCompanyId(null);
        setCompanyName(null);
        setTelephelyId(null);
        setTelephelyName(null);
        setLoading(false);
        return;
      }

      try {
        // Check if user has klinika_admin role
        const { data: hasRole, error: roleError } = await supabase
          .rpc('has_role', { _user_id: user.id, _role: 'klinika_admin' });

        if (roleError) {
          console.error('Error checking klinika_admin role:', roleError);
          setIsKlinikaAdmin(false);
          setLoading(false);
          return;
        }

        setIsKlinikaAdmin(!!hasRole);

        if (hasRole) {
          // Get the user's profile with company and telephely info
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select(`
              company_id,
              company_name,
              telephely_id
            `)
            .eq('user_id', user.id)
            .single();

          if (profileError) {
            console.error('Error fetching profile:', profileError);
          } else if (profile) {
            setCompanyId(profile.company_id);
            setCompanyName(profile.company_name);
            setTelephelyId(profile.telephely_id);

            // Get telephely name if we have telephely_id
            if (profile.telephely_id) {
              const { data: telephely } = await supabase
                .from('telephely')
                .select('name')
                .eq('id', profile.telephely_id)
                .single();
              
              if (telephely) {
                setTelephelyName(telephely.name);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking klinika_admin role:', err);
        setIsKlinikaAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    checkRole();
  }, [user]);

  return { isKlinikaAdmin, companyId, companyName, telephelyId, telephelyName, loading };
}
