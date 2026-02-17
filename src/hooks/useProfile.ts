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

        cachedProfile = data;
        cachedUserId = user.id;
        setProfile(data);
      } catch (err) {
        console.error('Error fetching profile:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [user]);

  return { profile, loading, error };
}
