import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserVoiceRecordingData {
  verdikt: string | null;
  paciensId: string;
  isPaciensIdLocked: boolean;
  mode: 'voxis' | 'treatnote';
}

interface VoiceRecordingState {
  // Data is stored per-user by their userId
  userData: Record<string, UserVoiceRecordingData>;
  
  // Getters - require userId
  getVerdikt: (userId: string) => string | null;
  getPaciensId: (userId: string) => string;
  getIsPaciensIdLocked: (userId: string) => boolean;
  getMode: (userId: string) => 'voxis' | 'treatnote';
  
  // Setters - require userId
  setVerdikt: (userId: string, verdikt: string | null) => void;
  setPaciensId: (userId: string, id: string) => void;
  setIsPaciensIdLocked: (userId: string, locked: boolean) => void;
  setMode: (userId: string, mode: 'voxis' | 'treatnote') => void;
  clearVerdikt: (userId: string) => void;
  resetUser: (userId: string) => void;
}

const defaultUserData: UserVoiceRecordingData = {
  verdikt: null,
  paciensId: '',
  isPaciensIdLocked: false,
  mode: 'treatnote',
};

export const useVoiceRecordingStore = create<VoiceRecordingState>()(
  persist(
    (set, get) => ({
      userData: {},

      getVerdikt: (userId) => get().userData[userId]?.verdikt ?? null,
      getPaciensId: (userId) => get().userData[userId]?.paciensId ?? '',
      getIsPaciensIdLocked: (userId) => get().userData[userId]?.isPaciensIdLocked ?? false,
      getMode: (userId) => get().userData[userId]?.mode ?? 'treatnote',

      setVerdikt: (userId, verdikt) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            verdikt,
          },
        },
      })),

      setPaciensId: (userId, paciensId) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            paciensId,
          },
        },
      })),

      setIsPaciensIdLocked: (userId, isPaciensIdLocked) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            isPaciensIdLocked,
          },
        },
      })),

      setMode: (userId, mode) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            mode,
          },
        },
      })),

      clearVerdikt: (userId) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            verdikt: null,
          },
        },
      })),

      resetUser: (userId) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: { ...defaultUserData },
        },
      })),
    }),
    {
      name: 'voice-recording-storage',
    }
  )
);
