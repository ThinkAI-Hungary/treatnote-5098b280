import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface VoiceRecordingState {
  verdikt: string | null;
  paciensId: string;
  isPaciensIdLocked: boolean;
  mode: 'voxis' | 'treatnote';
  
  setVerdikt: (verdikt: string | null) => void;
  setPaciensId: (id: string) => void;
  setIsPaciensIdLocked: (locked: boolean) => void;
  setMode: (mode: 'voxis' | 'treatnote') => void;
  clearVerdikt: () => void;
  reset: () => void;
}

export const useVoiceRecordingStore = create<VoiceRecordingState>()(
  persist(
    (set) => ({
      verdikt: null,
      paciensId: '',
      isPaciensIdLocked: false,
      mode: 'treatnote',

      setVerdikt: (verdikt) => set({ verdikt }),
      setPaciensId: (paciensId) => set({ paciensId }),
      setIsPaciensIdLocked: (isPaciensIdLocked) => set({ isPaciensIdLocked }),
      setMode: (mode) => set({ mode }),
      clearVerdikt: () => set({ verdikt: null }),
      reset: () => set({ verdikt: null, paciensId: '', isPaciensIdLocked: false, mode: 'treatnote' }),
    }),
    {
      name: 'voice-recording-storage',
    }
  )
);
