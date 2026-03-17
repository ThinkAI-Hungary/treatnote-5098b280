import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';

interface UseOnboardingTourOptions {
  tourKey: string;          // Unique key for this tour (e.g., 'klinika-admin-tour')
  isEligible: boolean;      // Whether user is eligible for this tour
  autoShowForNewUsers?: boolean; // Auto-show on first visit (default: true)
  newUserDays?: number;     // Kept for API compatibility — unused
}

interface UseOnboardingTourReturn {
  showTour: boolean;
  startTour: () => void;
  completeTour: () => void;
  skipTour: () => void;
  isNewUser: boolean;
  hasSeenTour: boolean;
  isMobile: boolean;
}

// Accounts that always see the tour (dev preview — treats every visit as a first visit)
// Add emails here to re-enable test mode: e.g. 'zsolt@gmail.com'
const DEV_PREVIEW_EMAILS: string[] = [];

// Module-level cache to prevent querying the database multiple times if multiple tours are rendered
let cachedIsFirstLogin: boolean | null = null;
let lastCacheUserId: string | null = null;

export function useOnboardingTour({
  tourKey, // Note: tourKey is no longer used for seen state, but kept for API compatibility and logging
  isEligible,
  autoShowForNewUsers = true,
}: UseOnboardingTourOptions): UseOnboardingTourReturn {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDevPreview = DEV_PREVIEW_EMAILS.includes(user?.email ?? '');

  const [showTour, setShowTour] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [checkedInitial, setCheckedInitial] = useState(false);

  // Check seen state on mount from Supabase
  useEffect(() => {
    if (!user) return;

    if (isDevPreview) {
      setHasSeenTour(false);
      setCheckedInitial(true);
      return;
    }

    const checkFirstLoginStatus = async () => {
      // Clear cache if user changes
      if (lastCacheUserId !== user.id) {
        cachedIsFirstLogin = null;
        lastCacheUserId = user.id;
      }

      let isFirst: boolean;

      if (cachedIsFirstLogin !== null) {
        isFirst = cachedIsFirstLogin;
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_first_login')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error("Error fetching first login status:", error);
          // Default to true (don't show tour on error to avoid spam)
          isFirst = false; 
        } else {
          isFirst = data?.is_first_login ?? false;
        }
        
        cachedIsFirstLogin = isFirst;
      }

      setHasSeenTour(!isFirst);
      setCheckedInitial(true);
    };

    checkFirstLoginStatus();
  }, [user, isDevPreview]);

  // Auto-show: fires once when this specific tour has not been seen yet
  useEffect(() => {
    if (!checkedInitial || !isEligible || isMobile) return;
    if (!autoShowForNewUsers || hasSeenTour) return;

    const timeout = setTimeout(() => {
      setShowTour(true);
    }, 800);
    return () => clearTimeout(timeout);
  }, [checkedInitial, autoShowForNewUsers, hasSeenTour, isEligible, isMobile]);

  const startTour = useCallback(() => {
    if (isMobile) return;
    setShowTour(true);
  }, [isMobile]);

  const markSeen = useCallback(async () => {
    setHasSeenTour(true);
    setShowTour(false);
    
    // Update local cache so other components on the page know
    cachedIsFirstLogin = false;

    if (!isDevPreview && user) {
      const { error } = await supabase.rpc('mark_first_login_complete');
      if (error) {
        console.error("Failed to mark first login complete:", error);
      }
    }
  }, [isDevPreview, user]);

  const completeTour = markSeen;
  const skipTour = markSeen;

  return {
    showTour,
    startTour,
    completeTour,
    skipTour,
    isNewUser: !hasSeenTour,  // kept for API compatibility
    hasSeenTour,
    isMobile,
  };
}
