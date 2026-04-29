import { create } from 'zustand';

interface HeaderMessageState {
  message: string | null;
  type: 'success' | 'error' | 'info';
  showMessage: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  clearMessage: () => void;
}

let timeoutId: NodeJS.Timeout | null = null;

export const useHeaderMessage = create<HeaderMessageState>((set) => ({
  message: null,
  type: 'info',
  showMessage: (message, type = 'success', duration = 4000) => {
    if (timeoutId) clearTimeout(timeoutId);
    set({ message, type });
    if (duration > 0) {
      timeoutId = setTimeout(() => {
        set({ message: null });
      }, duration);
    }
  },
  clearMessage: () => {
    if (timeoutId) clearTimeout(timeoutId);
    set({ message: null });
  }
}));
