import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VoiceRecordingState {
  verdikt: string | null;
  paciensId: string;
  isPaciensIdLocked: boolean;
  mode: 'voxis' | 'treatnote';
  userId: string | null; // Track which user owns this data
  
  setVerdikt: (verdikt: string | null) => void;
  setPaciensId: (id: string) => void;
  setIsPaciensIdLocked: (locked: boolean) => void;
  setMode: (mode: 'voxis' | 'treatnote') => void;
  clearVerdikt: () => void;
  reset: () => void;
  setUserId: (userId: string | null) => void;
  validateAndClearIfDifferentUser: (currentUserId: string | null) => void;
}

export const useVoiceRecordingStore = create<VoiceRecordingState>()(
  persist(
    (set, get) => ({
      verdikt: null,
      paciensId: '',
      isPaciensIdLocked: false,
      mode: 'treatnote',
      userId: null,

      setVerdikt: (verdikt) => set({ verdikt }),
      setPaciensId: (paciensId) => set({ paciensId }),
      setIsPaciensIdLocked: (isPaciensIdLocked) => set({ isPaciensIdLocked }),
      setMode: (mode) => set({ mode }),
      clearVerdikt: () => set({ verdikt: null }),
      reset: () => set({ verdikt: null, paciensId: '', isPaciensIdLocked: false, mode: 'treatnote', userId: null }),
      setUserId: (userId) => set({ userId }),
      validateAndClearIfDifferentUser: (currentUserId) => {
        const state = get();
        // If there's stored data from a different user, clear it
        if (state.userId && currentUserId && state.userId !== currentUserId) {
          set({ 
            verdikt: null, 
            paciensId: '', 
            isPaciensIdLocked: false, 
            mode: 'treatnote',
            userId: currentUserId 
          });
        } else if (currentUserId && !state.userId) {
          // If no userId was stored, set it now
          set({ userId: currentUserId });
        }
      },
    }),
    {
      name: 'voice-recording-storage',
    }
  )
);
