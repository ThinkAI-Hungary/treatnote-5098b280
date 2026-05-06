import { create } from 'zustand';

export interface NotificationEntry {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  timestamp: Date;
}

interface HeaderMessageState {
  message: string | null;
  type: 'success' | 'error' | 'info';
  history: NotificationEntry[];
  lastReadAt: number; // epoch ms — entries after this are "unread"
  showMessage: (msg: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  clearMessage: () => void;
  clearHistory: () => void;
  markAllRead: () => void;
}

let timeoutId: NodeJS.Timeout | null = null;

export const useHeaderMessage = create<HeaderMessageState>((set) => ({
  message: null,
  type: 'info',
  history: [],
  lastReadAt: Date.now(),
  showMessage: (message, type = 'success', duration = 4000) => {
    if (timeoutId) clearTimeout(timeoutId);
    const entry: NotificationEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message,
      type,
      timestamp: new Date(),
    };
    set(state => ({
      message,
      type,
      // Keep last 50 entries, newest first
      history: [entry, ...state.history].slice(0, 50),
    }));
    if (duration > 0) {
      timeoutId = setTimeout(() => {
        set({ message: null });
      }, duration);
    }
  },
  clearMessage: () => {
    if (timeoutId) clearTimeout(timeoutId);
    set({ message: null });
  },
  clearHistory: () => set({ history: [], lastReadAt: Date.now() }),
  markAllRead: () => set({ lastReadAt: Date.now() }),
}));
