import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Custom event for flexi connection changes
const FLEXI_CONNECTION_CHANGED = 'flexi-connection-changed';

export function notifyFlexiConnectionChanged() {
  window.dispatchEvent(new CustomEvent(FLEXI_CONNECTION_CHANGED));
}

// Module-level cache so data persists across component mounts
let cachedIsConnected: boolean | null = null;
let cachedFlexiUsername: string | null = null;
let cachedFlexiUserId: string | null = null;

export function useFlexiConnection() {
  const { user } = useAuth();

  // If user changed, invalidate cache
  if (user?.id !== cachedFlexiUserId) {
    cachedIsConnected = null;
    cachedFlexiUsername = null;
    cachedFlexiUserId = user?.id ?? null;
  }

  const [isConnected, setIsConnected] = useState<boolean | null>(cachedIsConnected);
  const [flexiUsername, setFlexiUsername] = useState<string | null>(cachedFlexiUsername);
  const [isLoading, setIsLoading] = useState(cachedIsConnected === null && !!user);

  const checkFlexiConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
      setIsLoading(false);
      cachedIsConnected = false;
      cachedFlexiUsername = null;
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
        setFlexiUsername(null);
        cachedIsConnected = false;
        cachedFlexiUsername = null;
      } else {
        const connected = !!data?.flexi_username;
        const username = data?.flexi_username || null;
        setIsConnected(connected);
        setFlexiUsername(username);
        cachedIsConnected = connected;
        cachedFlexiUsername = username;
        cachedFlexiUserId = user.id;
      }
    } catch (error) {
      console.error('Error checking flexi connection:', error);
      setIsConnected(false);
      setFlexiUsername(null);
      cachedIsConnected = false;
      cachedFlexiUsername = null;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
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
            setFlexiUsername(null);
            cachedIsConnected = false;
            cachedFlexiUsername = null;
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as { flexi_username?: string };
            const connected = !!newData?.flexi_username;
            const username = newData?.flexi_username || null;
            setIsConnected(connected);
            setFlexiUsername(username);
            cachedIsConnected = connected;
            cachedFlexiUsername = username;
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

  return { isConnected, flexiUsername, isLoading, refetch: checkFlexiConnection };
}

