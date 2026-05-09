import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserVoiceRecordingData {
  verdikt: string | null;
  lastJobId: string | null;
  paciensId: string;
  isPaciensIdLocked: boolean;
  mode: 'voxis' | 'treatnote' | 'ambulans';
}

interface VoiceRecordingState {
  // Data is stored per-user by their userId
  userData: Record<string, UserVoiceRecordingData>;
  
  // Getters - require userId
  getVerdikt: (userId: string) => string | null;
  getLastJobId: (userId: string) => string | null;
  getPaciensId: (userId: string) => string;
  getIsPaciensIdLocked: (userId: string) => boolean;
  getMode: (userId: string) => 'voxis' | 'treatnote' | 'ambulans';
  
  // Setters - require userId
  setVerdikt: (userId: string, verdikt: string | null, jobId?: string | null) => void;
  setPaciensId: (userId: string, id: string) => void;
  setIsPaciensIdLocked: (userId: string, locked: boolean) => void;
  setMode: (userId: string, mode: 'voxis' | 'treatnote' | 'ambulans') => void;
  clearVerdikt: (userId: string) => void;
  resetUser: (userId: string) => void;
}

const defaultUserData: UserVoiceRecordingData = {
  verdikt: null,
  lastJobId: null,
  paciensId: '',
  isPaciensIdLocked: false,
  mode: 'treatnote',
};

export const useVoiceRecordingStore = create<VoiceRecordingState>()(
  persist(
    (set, get) => ({
      userData: {},

      getVerdikt: (userId) => get().userData[userId]?.verdikt ?? null,
      getLastJobId: (userId) => get().userData[userId]?.lastJobId ?? null,
      getPaciensId: (userId) => get().userData[userId]?.paciensId ?? '',
      getIsPaciensIdLocked: (userId) => get().userData[userId]?.isPaciensIdLocked ?? false,
      getMode: (userId) => get().userData[userId]?.mode ?? 'treatnote',

      setVerdikt: (userId, verdikt, jobId = null) => set((state) => ({
        userData: {
          ...state.userData,
          [userId]: {
            ...(state.userData[userId] ?? defaultUserData),
            verdikt,
            lastJobId: jobId !== null ? jobId : (verdikt === null ? null : state.userData[userId]?.lastJobId),
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
            lastJobId: null,
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
