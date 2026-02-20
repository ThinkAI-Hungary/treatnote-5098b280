import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;

// Module-level cache so data persists across component mounts
let cachedProfile: Profile | null = null;
let cachedUserId: string | null = null;

export function useProfile() {
  const { user } = useAuth();

  // If user changed, invalidate cache
  if (user?.id !== cachedUserId) {
    cachedProfile = null;
    cachedUserId = user?.id ?? null;
  }

  const [profile, setProfile] = useState<Profile | null>(cachedProfile);
  const [loading, setLoading] = useState(!cachedProfile && !!user);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      if (!user) {
        setProfile(null);
        setLoading(false);
        cachedProfile = null;
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        // If the user belongs to a company, verify it is active.
        // If deactivated, mask the company/telephely so the rest of the
        // app behaves as if no company was assigned.
        let effectiveProfile = data;
        if (data?.company_id) {
          const { data: company } = await supabase
            .from('companies')
            .select('is_active')
            .eq('id', data.company_id)
            .maybeSingle();

          if (company && company.is_active === false) {
            effectiveProfile = {
              ...data,
              company_id: null,
              company_name: null,
              telephely_id: null,
            };
          }
        }

        cachedProfile = effectiveProfile;
        cachedUserId = user.id;
        setProfile(effectiveProfile);
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [user]);

  // Realtime subscription: re-fetch whenever the profile row changes.
  // This is what makes useSzotar / useFlexiConnection react to telephely assignment
  // without needing a manual page refresh.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile_rt_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          // Invalidate module cache and re-fetch fresh data
          cachedProfile = null;

          try {
            const { data, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle();

            if (error) throw error;

            let effectiveProfile = data;
            if (data?.company_id) {
              const { data: company } = await supabase
                .from('companies')
                .select('is_active')
                .eq('id', data.company_id)
                .maybeSingle();

              if (company && company.is_active === false) {
                effectiveProfile = {
                  ...data,
                  company_id: null,
                  company_name: null,
                  telephely_id: null,
                };
              }
            }

            cachedProfile = effectiveProfile;
            cachedUserId = user.id;
            setProfile(effectiveProfile);
          } catch (err) {
            console.error('Error re-fetching profile after realtime update:', err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { profile, loading, error };
}
