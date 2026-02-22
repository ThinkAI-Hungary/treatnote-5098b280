import { useState, useEffect, useCallback, useRef } from 'react';
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
  // Start loading only when there is no cached data yet.
  const [isLoading, setIsLoading] = useState(cached === undefined && !!user);

  const updateCache = useCallback((connected: boolean, username: string | null) => {
    if (cacheKey) {
      flexiCache.set(cacheKey, { isConnected: connected, flexiUsername: username });
    }
    setIsConnected(connected);
    setFlexiUsername(username);
  }, [cacheKey]);

  // Generation counter — incremented each time a fetch starts.
  // Allows in-flight stale fetches (e.g. for telephely=null while profile loads)
  // to be silently discarded when a newer fetch supersedes them.
  const fetchGenRef = useRef(0);

  const checkFlexiConnection = useCallback(async () => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
      setIsLoading(false);
      return;
    }

    // Grab this fetch's generation BEFORE the first await so we can detect staleness.
    const myGen = ++fetchGenRef.current;

    // Signal loading immediately so callers don't see a stale resolved state.
    setIsLoading(true);

    /**
     * Three-strategy fallback chain:
     * 1. Exact telephely_id match  — normal case
     * 2. telephely_id IS NULL      — legacy rows saved before telephely scoping
     * 3. 800 ms RLS timing retry   — first-login auth propagation lag
     *    (skipped when telephelyId is null — no point waiting for an empty result)
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

      // Strategy 2: null-telephely fallback
      if (!error && !data) {
        ({ data, error } = await queryNullTelephely());
      }

      // Strategy 3: RLS timing retry — only when we have a real telephely to query.
      if (!error && !data && telephelyId) {
        await new Promise<void>(r => setTimeout(r, 800));
        // Bail out early if a newer fetch has started (stale result).
        if (fetchGenRef.current !== myGen) return;
        ({ data, error } = await queryWithTelephelyId());
        if (!error && !data) {
          ({ data, error } = await queryNullTelephely());
        }
      }

      // Discard result if a newer fetch supersedes this one.
      if (fetchGenRef.current !== myGen) return;

      if (error) {
        console.error('Error checking flexi connection:', error);
        setIsConnected(false);
        setFlexiUsername(null);
      } else {
        const connected = !!data?.flexi_username;
        const username = data?.flexi_username || null;
        updateCache(connected, username);
        cacheUserId = user.id;
      }
    } catch (err) {
      if (fetchGenRef.current !== myGen) return;
      console.error('Error checking flexi connection:', err);
      setIsConnected(false);
      setFlexiUsername(null);
    } finally {
      // Only update loading if this is still the current fetch.
      if (fetchGenRef.current === myGen) {
        setIsLoading(false);
      }
    }
  }, [user, telephelyId, updateCache]);
  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setFlexiUsername(null);
      setIsLoading(false);
      return;
    }

    // Fetch if not yet cached; if already cached by another component instance,
    // still sync this instance's state from the cache so a stale null/false
    // initial state (from a previous null-telephely render) doesn't persist.
    if (cached === undefined) {
      checkFlexiConnection();
    } else {
      setIsConnected(cached.isConnected);
      setFlexiUsername(cached.flexiUsername);
      setIsLoading(false);
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
    // NOTE: `cached` and `updateCache` are intentionally NOT in deps.
    // `cached` is from the module-level Map — putting it in deps caused an infinite
    // loop (updateCache mutates the Map → cached changes → effect re-runs → loop).
    // `updateCache` changes only when cacheKey changes, which is captured by telephelyId+user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, telephelyId, checkFlexiConnection]);

  return { isConnected, flexiUsername, isLoading, refetch: checkFlexiConnection };
}
