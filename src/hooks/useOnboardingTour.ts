import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

interface UseOnboardingTourOptions {
  tourKey: string; // Unique key for this tour (e.g., 'klinika-admin-tour')
  isEligible: boolean; // Whether user is eligible for this tour
  autoShowForNewUsers?: boolean; // Show automatically for new users (default: true)
  newUserDays?: number; // Kept for API compatibility — no longer used
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
// Global key: marks that this user has seen at least one tour (= not first login anymore)
const GLOBAL_FIRST_SEEN_PREFIX = 'tour_first_login_done_';

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
  const [isNewUser, setIsNewUser] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [checkedInitial, setCheckedInitial] = useState(false);

  // Per-tour storage key (tracks whether THIS tour was completed)
  const getStorageKey = useCallback(() => {
    return `${TOUR_STORAGE_PREFIX}${tourKey}_${user?.id || 'anonymous'}`;
  }, [tourKey, user?.id]);

  // Global first-login key — set once after the user sees any tour for the first time
  const getGlobalFirstSeenKey = useCallback(() => {
    return `${GLOBAL_FIRST_SEEN_PREFIX}${user?.id || 'anonymous'}`;
  }, [user?.id]);

  // Check seen state on mount
  useEffect(() => {
    if (!user) return;

    // Dev preview: always treat as unseen / new user
    if (isDevPreview) {
      setHasSeenTour(false);
      setIsNewUser(true);
      setCheckedInitial(true);
      return;
    }

    const storageKey = getStorageKey();
    const completed = localStorage.getItem(storageKey);
    setHasSeenTour(completed === 'true');

    // A user is "new" only if they have never seen ANY tour across the whole app.
    // Also: if they already have a per-tour completed key from before the global key existed,
    // treat them as done and write the global key so they never auto-see a tour again.
    const globalKey = getGlobalFirstSeenKey();
    const globalDone = localStorage.getItem(globalKey);
    if (globalDone !== 'true' && completed === 'true') {
      // Existing user who completed a tour before the global key was introduced
      localStorage.setItem(globalKey, 'true');
      setIsNewUser(false);
    } else {
      setIsNewUser(globalDone !== 'true');
    }

    setCheckedInitial(true);
  }, [user, isDevPreview, getStorageKey, getGlobalFirstSeenKey]);

  // Auto-show: only fires if this is the user's very first login (global key not set yet)
  useEffect(() => {
    if (!checkedInitial || !isEligible || isMobile) return;

    if (autoShowForNewUsers && isNewUser && !hasSeenTour) {
      const timeout = setTimeout(() => {
        setShowTour(true);
        setIsNewUser(false); // prevent re-triggering on next render
        // Write the global key NOW so navigating away+back won't re-show the tour,
        // even if the user closes via the X button (never calling skipTour/completeTour)
        if (!isDevPreview) {
          const key = `${GLOBAL_FIRST_SEEN_PREFIX}${user?.id || 'anonymous'}`;
          localStorage.setItem(key, 'true');
        }
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [checkedInitial, autoShowForNewUsers, isNewUser, hasSeenTour, isEligible, isMobile, isDevPreview, user?.id]);


  const startTour = useCallback(() => {
    if (isMobile) return;
    setShowTour(true);
  }, [isMobile]);

  const completeTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    if (!isDevPreview) {
      localStorage.setItem(getStorageKey(), 'true');
      // Mark globally that the user has been through their first tour
      localStorage.setItem(getGlobalFirstSeenKey(), 'true');
    }
  }, [getStorageKey, getGlobalFirstSeenKey, isDevPreview]);

  const skipTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    if (!isDevPreview) {
      localStorage.setItem(getStorageKey(), 'true');
      // Skipping also counts as "done with first login tour"
      localStorage.setItem(getGlobalFirstSeenKey(), 'true');
    }
  }, [getStorageKey, getGlobalFirstSeenKey, isDevPreview]);

  return {
    showTour,
    startTour,
    completeTour,
    skipTour,
    isNewUser,
    hasSeenTour,
    isMobile,
  };
}
