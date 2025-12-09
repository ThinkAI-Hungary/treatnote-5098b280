import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export function useFlexiConnection() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    const checkFlexiConnection = async () => {
      try {
        const { data, error } = await supabase
          .from('flexi_auth')
          .select('id, flexi_username')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking flexi connection:', error);
          setIsConnected(false);
        } else {
          setIsConnected(!!data?.flexi_username);
        }
      } catch (error) {
        console.error('Error checking flexi connection:', error);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkFlexiConnection();

    // Subscribe to changes in flexi_auth table for real-time updates
    const channel = supabase
      .channel('flexi_auth_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flexi_auth',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setIsConnected(false);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as { flexi_username?: string };
            setIsConnected(!!newData?.flexi_username);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { isConnected, isLoading };
}
