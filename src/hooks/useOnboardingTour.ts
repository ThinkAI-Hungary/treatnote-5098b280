import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

interface UseOnboardingTourOptions {
  tourKey: string; // Unique key for this tour (e.g., 'klinika-admin-tour')
  isEligible: boolean; // Whether user is eligible for this tour
  autoShowForNewUsers?: boolean; // Show automatically for new users (default: true)
  newUserDays?: number; // Consider user "new" within this many days (default: 7)
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

// Accounts that always see the tour (for testing — treats every visit as a first visit)
// To re-enable: uncomment the email below
const DEV_PREVIEW_EMAILS: string[] = [
  'zsolt@gmail.com',
];

export function useOnboardingTour({
  tourKey,
  isEligible,
  autoShowForNewUsers = true,
  newUserDays = 7,
}: UseOnboardingTourOptions): UseOnboardingTourReturn {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDevPreview = DEV_PREVIEW_EMAILS.includes(user?.email ?? '');
  const [showTour, setShowTour] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState(false);
  const [checkedInitial, setCheckedInitial] = useState(false);

  // Check if user has seen this tour before (localStorage)
  const getStorageKey = useCallback(() => {
    return `${TOUR_STORAGE_PREFIX}${tourKey}_${user?.id || 'anonymous'}`;
  }, [tourKey, user?.id]);

  // Check if tour was completed
  useEffect(() => {
    if (!user) return;

    // Dev preview: always treat as not seen and mark as new user
    if (isDevPreview) {
      setHasSeenTour(false);
      setIsNewUser(true);
      setCheckedInitial(true);
      return;
    }

    const storageKey = getStorageKey();
    const completed = localStorage.getItem(storageKey);
    setHasSeenTour(completed === 'true');
    setCheckedInitial(true);
  }, [user, isDevPreview, getStorageKey]);

  // Check if user is new (created within newUserDays) — skipped for dev preview
  useEffect(() => {
    if (!user || !isEligible || isDevPreview) return;

    const checkNewUser = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('user_id', user.id)
        .single();

      if (profile?.created_at) {
        const createdAt = new Date(profile.created_at);
        const cutoffDate = new Date(Date.now() - newUserDays * 24 * 60 * 60 * 1000);
        setIsNewUser(createdAt > cutoffDate);
      }
    };

    checkNewUser();
  }, [user, isEligible, isDevPreview, newUserDays]);

  // Auto-show tour for new users who haven't seen it
  useEffect(() => {
    if (!checkedInitial || !isEligible || isMobile) return;

    if (autoShowForNewUsers && isNewUser && !hasSeenTour) {
      // Small delay to let the page render first
      const timeout = setTimeout(() => {
        setShowTour(true);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [checkedInitial, autoShowForNewUsers, isNewUser, hasSeenTour, isEligible, isMobile]);

  const startTour = useCallback(() => {
    if (isMobile) return;
    setShowTour(true);
  }, [isMobile]);

  const completeTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    // Dev preview: don't persist so the tour always re-shows
    if (!DEV_PREVIEW_EMAILS.includes(user?.email ?? '')) {
      localStorage.setItem(getStorageKey(), 'true');
    }
  }, [getStorageKey, user?.email]);

  const skipTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    // Dev preview: don't persist so the tour always re-shows
    if (!DEV_PREVIEW_EMAILS.includes(user?.email ?? '')) {
      localStorage.setItem(getStorageKey(), 'true');
    }
  }, [getStorageKey, user?.email]);

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
