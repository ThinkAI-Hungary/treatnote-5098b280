import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

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

const TOUR_STORAGE_PREFIX = 'tour_completed_';

// Accounts that always see the tour (dev preview — treats every visit as a first visit)
// Add emails here to re-enable test mode: e.g. 'zsolt@gmail.com'
const DEV_PREVIEW_EMAILS: string[] = [];

export function useOnboardingTour({
  tourKey,
  isEligible,
  autoShowForNewUsers = true,
}: UseOnboardingTourOptions): UseOnboardingTourReturn {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDevPreview = DEV_PREVIEW_EMAILS.includes(user?.email ?? '');

  const [showTour, setShowTour] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [checkedInitial, setCheckedInitial] = useState(false);

  // Per-tour storage key (tracks whether THIS specific tour was ever completed/skipped)
  const getStorageKey = useCallback(() => {
    return `${TOUR_STORAGE_PREFIX}${tourKey}_${user?.id || 'anonymous'}`;
  }, [tourKey, user?.id]);

  // Check seen state on mount — reads only this tour's key
  useEffect(() => {
    if (!user) return;

    if (isDevPreview) {
      setHasSeenTour(false);
      setCheckedInitial(true);
      return;
    }

    const completed = localStorage.getItem(getStorageKey());
    setHasSeenTour(completed === 'true');
    setCheckedInitial(true);
  }, [user, isDevPreview, getStorageKey]);

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

  const markSeen = useCallback(() => {
    if (!isDevPreview) {
      localStorage.setItem(getStorageKey(), 'true');
    }
    setHasSeenTour(true);
    setShowTour(false);
  }, [getStorageKey, isDevPreview]);

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
