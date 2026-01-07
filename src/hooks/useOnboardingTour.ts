import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

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
}

const TOUR_STORAGE_PREFIX = 'tour_completed_';

export function useOnboardingTour({
  tourKey,
  isEligible,
  autoShowForNewUsers = true,
  newUserDays = 7,
}: UseOnboardingTourOptions): UseOnboardingTourReturn {
  const { user } = useAuth();
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

    const storageKey = getStorageKey();
    const completed = localStorage.getItem(storageKey);
    setHasSeenTour(completed === 'true');
    setCheckedInitial(true);
  }, [user, getStorageKey]);

  // Check if user is new (created within newUserDays)
  useEffect(() => {
    if (!user || !isEligible) return;

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
  }, [user, isEligible, newUserDays]);

  // Auto-show tour for new users who haven't seen it
  useEffect(() => {
    if (!checkedInitial || !isEligible) return;

    if (autoShowForNewUsers && isNewUser && !hasSeenTour) {
      // Small delay to let the page render first
      const timeout = setTimeout(() => {
        setShowTour(true);
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [checkedInitial, autoShowForNewUsers, isNewUser, hasSeenTour, isEligible]);

  const startTour = useCallback(() => {
    setShowTour(true);
  }, []);

  const completeTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    localStorage.setItem(getStorageKey(), 'true');
  }, [getStorageKey]);

  const skipTour = useCallback(() => {
    setShowTour(false);
    setHasSeenTour(true);
    localStorage.setItem(getStorageKey(), 'true');
  }, [getStorageKey]);

  return {
    showTour,
    startTour,
    completeTour,
    skipTour,
    isNewUser,
    hasSeenTour,
  };
}
