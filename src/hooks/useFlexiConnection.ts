import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Custom event for flexi connection changes
const FLEXI_CONNECTION_CHANGED = 'flexi-connection-changed';

export function notifyFlexiConnectionChanged() {
  window.dispatchEvent(new CustomEvent(FLEXI_CONNECTION_CHANGED));
}

export function useFlexiConnection() {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkFlexiConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

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
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    checkFlexiConnection();

    // Listen for custom events (immediate updates from same tab)
    const handleFlexiChange = () => {
      checkFlexiConnection();
    };
    window.addEventListener(FLEXI_CONNECTION_CHANGED, handleFlexiChange);

    // Subscribe to changes in flexi_auth table for real-time updates (cross-tab/device)
    const channel = supabase
      .channel(`flexi_auth_changes_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'flexi_auth',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Flexi auth realtime update:', payload);
          if (payload.eventType === 'DELETE') {
            setIsConnected(false);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as { flexi_username?: string };
            setIsConnected(!!newData?.flexi_username);
          }
        }
      )
      .subscribe((status) => {
        console.log('Flexi auth channel status:', status);
      });

    return () => {
      window.removeEventListener(FLEXI_CONNECTION_CHANGED, handleFlexiChange);
      supabase.removeChannel(channel);
    };
  }, [user, checkFlexiConnection]);

  return { isConnected, isLoading, refetch: checkFlexiConnection };
}
