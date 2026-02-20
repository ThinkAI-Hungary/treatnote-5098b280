import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

// Custom event for flexi connection changes
const FLEXI_CONNECTION_CHANGED = 'flexi-connection-changed';

export function notifyFlexiConnectionChanged() {
  window.dispatchEvent(new CustomEvent(FLEXI_CONNECTION_CHANGED));
}

// Module-level cache keyed by "userId:telephelyId" so data persists across component mounts
// but is properly scoped per telephely.
interface FlexiCacheEntry {
  isConnected: boolean;
  flexiUsername: string | null;
}
const flexiCache: Map<string, FlexiCacheEntry> = new Map();
let cacheUserId: string | null = null;

function getCacheKey(userId: string, telephelyId: string | null): string {
  return `${userId}:${telephelyId ?? 'none'}`;
}

/**
 * Tracks whether the current user has connected their Flexi-Dent account
 * for the given telephely. Each telephely must be connected independently.
 *
 * @param telephelyId - The ID of the currently active telephely (null = no scope yet)
 */
export function useFlexiConnection(telephelyId: string | null = null) {
  const { user } = useAuth();

  // If user changed, invalidate all cache entries
  if (user?.id !== cacheUserId) {
    flexiCache.clear();
    cacheUserId = user?.id ?? null;
  }

  const cacheKey = user?.id ? getCacheKey(user.id, telephelyId) : null;
  const cached = cacheKey ? flexiCache.get(cacheKey) : undefined;

  const [isConnected, setIsConnected] = useState<boolean | null>(cached?.isConnected ?? null);
  const [flexiUsername, setFlexiUsername] = useState<string | null>(cached?.flexiUsername ?? null);
  // Start loading whenever a check is needed — regardless of telephelyId being null,
  // because we also search for null-telephely connections (legacy/pre-assignment rows).
  const [isLoading, setIsLoading] = useState(cached === undefined && !!user);

  const updateCache = useCallback((connected: boolean, username: string | null) => {
    if (cacheKey) {
      flexiCache.set(cacheKey, { isConnected: connected, flexiUsername: username });
    }
    setIsConnected(connected);
    setFlexiUsername(username);
  }, [cacheKey]);

  const checkFlexiConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
      setIsLoading(false);
      return;
    }

    /**
     * Three-strategy fallback chain — mirrors what Profile.tsx does:
     *
     * 1. Exact telephely_id match   — normal case
     * 2. telephely_id IS NULL       — legacy connections saved before telephely was assigned
     * 3. 800 ms timing retry        — handles first-login RLS propagation lag on Supabase
     *
     * Only confirmed results are cached. Errors are NOT cached so the next mount retries.
     */
    const queryWithTelephelyId = () =>
      telephelyId
        ? supabase
          .from('flexi_auth')
          .select('id, flexi_username')
          .eq('user_id', user.id)
          .eq('telephely_id', telephelyId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null });

    const queryNullTelephely = () =>
      supabase
        .from('flexi_auth')
        .select('id, flexi_username')
        .eq('user_id', user.id)
        .is('telephely_id', null)
        .maybeSingle();

    try {
      // Strategy 1: exact telephely match
      let { data, error } = await queryWithTelephelyId();

      // Strategy 2: null-telephely fallback (legacy rows saved without a telephely scope)
      if (!error && !data) {
        ({ data, error } = await queryNullTelephely());
      }

      // Strategy 3: RLS timing retry after 800 ms (first-login auth propagation lag)
      if (!error && !data) {
        await new Promise<void>(r => setTimeout(r, 800));
        ({ data, error } = await queryWithTelephelyId());
        if (!error && !data) {
          ({ data, error } = await queryNullTelephely());
        }
      }

      if (error) {
        console.error('Error checking flexi connection:', error);
        // Do NOT cache errors — next mount will retry.
        setIsConnected(false);
        setFlexiUsername(null);
      } else {
        const connected = !!data?.flexi_username;
        const username = data?.flexi_username || null;
        updateCache(connected, username);
        cacheUserId = user.id;
      }
    } catch (err) {
      console.error('Error checking flexi connection:', err);
      setIsConnected(false);
      setFlexiUsername(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, telephelyId, updateCache]);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
      setIsLoading(false);
      return;
    }

    // Only fetch if not already cached
    if (cached === undefined) {
      checkFlexiConnection();
    }

    // Listen for custom events (immediate updates from same tab)
    const handleFlexiChange = () => {
      checkFlexiConnection();
    };
    window.addEventListener(FLEXI_CONNECTION_CHANGED, handleFlexiChange);

    // Subscribe to changes in flexi_auth table for real-time updates (cross-tab/device)
    const channel = supabase
      .channel(`flexi_auth_changes_${user.id}_${telephelyId}`)
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
          const rowTelephely = (payload.new as { telephely_id?: string })?.telephely_id
            ?? (payload.old as { telephely_id?: string })?.telephely_id;
          if (rowTelephely && rowTelephely !== telephelyId) return;

          if (payload.eventType === 'DELETE') {
            updateCache(false, null);
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newData = payload.new as { flexi_username?: string };
            const connected = !!newData?.flexi_username;
            const username = newData?.flexi_username || null;
            updateCache(connected, username);
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
  }, [user, telephelyId, checkFlexiConnection, cached, updateCache]);

  return { isConnected, flexiUsername, isLoading, refetch: checkFlexiConnection };
}
