import { createContext, useContext, useReducer, useCallback, useEffect, useRef, ReactNode } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────
export type NotificationFamily = 'telephely' | 'szotar' | 'szabalyok' | 'user' | 'general';

export interface AppNotification {
    id: string;
    family: NotificationFamily;
    message: string;
    count: number;
    timestamp: number;
    icon?: string; // lucide icon name
    dismissing?: boolean; // for exit animation
}

interface NotificationState {
    notifications: AppNotification[];
}

type NotificationAction =
    | { type: 'ADD'; payload: { family: NotificationFamily; message: string; icon?: string } }
    | { type: 'DISMISS'; payload: { id: string } }
    | { type: 'MARK_DISMISSING'; payload: { id: string } }
    | { type: 'CLEAR_ALL' };

// ─── Constants ──────────────────────────────────────────────────────────
const STACK_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const AUTO_DISMISS_MS = 8_000; // 8 seconds

// ─── Reducer ────────────────────────────────────────────────────────────
function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
    switch (action.type) {
        case 'ADD': {
            const { family, message, icon } = action.payload;
            const now = Date.now();

            // Check if there's a stackable notification (same family, within window)
            const existingIdx = state.notifications.findIndex(
                (n) => n.family === family && !n.dismissing && now - n.timestamp < STACK_WINDOW_MS
            );

            if (existingIdx !== -1) {
                // Stack: increment count and update timestamp
                const updated = [...state.notifications];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    count: updated[existingIdx].count + 1,
                    message, // update to latest message
                    timestamp: now,
                };
                return { notifications: updated };
            }

            // New notification
            const newNotification: AppNotification = {
                id: `${family}-${now}-${Math.random().toString(36).slice(2, 7)}`,
                family,
                message,
                count: 1,
                timestamp: now,
                icon,
            };

            return { notifications: [...state.notifications, newNotification] };
        }

        case 'MARK_DISMISSING': {
            return {
                notifications: state.notifications.map((n) =>
                    n.id === action.payload.id ? { ...n, dismissing: true } : n
                ),
            };
        }

        case 'DISMISS': {
            return {
                notifications: state.notifications.filter((n) => n.id !== action.payload.id),
            };
        }

        case 'CLEAR_ALL': {
            return { notifications: [] };
        }

        default:
            return state;
    }
}

// ─── Context ────────────────────────────────────────────────────────────
interface NotificationContextValue {
    notifications: AppNotification[];
    addNotification: (family: NotificationFamily, message: string, icon?: string) => void;
    dismissNotification: (id: string) => void;
    clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────
export function NotificationProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(notificationReducer, { notifications: [] });
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismissNotification = useCallback((id: string) => {
        // Start exit animation
        dispatch({ type: 'MARK_DISMISSING', payload: { id } });
        // Remove after animation
        setTimeout(() => {
            dispatch({ type: 'DISMISS', payload: { id } });
            timersRef.current.delete(id);
        }, 300);
    }, []);

    const addNotification = useCallback(
        (family: NotificationFamily, message: string, icon?: string) => {
            dispatch({ type: 'ADD', payload: { family, message, icon } });
        },
        []
    );

    // Set up auto-dismiss timers for new/updated notifications
    useEffect(() => {
        for (const notification of state.notifications) {
            if (notification.dismissing) continue;

            // Clear existing timer (in case count was incremented = timestamp refreshed)
            const existingTimer = timersRef.current.get(notification.id);
            if (existingTimer) clearTimeout(existingTimer);

            const remaining = AUTO_DISMISS_MS - (Date.now() - notification.timestamp);
            if (remaining <= 0) {
                dismissNotification(notification.id);
            } else {
                const timer = setTimeout(() => {
                    dismissNotification(notification.id);
                }, remaining);
                timersRef.current.set(notification.id, timer);
            }
        }

        // Cleanup timers for removed notifications
        for (const [id] of timersRef.current) {
            if (!state.notifications.find((n) => n.id === id)) {
                clearTimeout(timersRef.current.get(id)!);
                timersRef.current.delete(id);
            }
        }
    }, [state.notifications, dismissNotification]);

    // Cleanup all timers on unmount
    useEffect(() => {
        return () => {
            for (const timer of timersRef.current.values()) {
                clearTimeout(timer);
            }
        };
    }, []);

    const clearAll = useCallback(() => {
        dispatch({ type: 'CLEAR_ALL' });
        for (const timer of timersRef.current.values()) {
            clearTimeout(timer);
        }
        timersRef.current.clear();
    }, []);

    return (
        <NotificationContext.Provider
            value={{
                notifications: state.notifications,
                addNotification,
                dismissNotification,
                clearAll,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

// ─── Hook ───────────────────────────────────────────────────────────────
export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
