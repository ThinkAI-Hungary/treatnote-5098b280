import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { X, Building2, BookOpen, FileText, UserCheck, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

// Map family → icon component
function FamilyIcon({ family }: { family: AppNotification['family'] }) {
    const iconClass = 'h-4 w-4 shrink-0';
    switch (family) {
        case 'telephely':
            return <Building2 className={cn(iconClass, 'text-emerald-400')} />;
        case 'szotar':
            return <BookOpen className={cn(iconClass, 'text-sky-400')} />;
        case 'szabalyok':
            return <FileText className={cn(iconClass, 'text-amber-400')} />;
        case 'user':
            return <UserCheck className={cn(iconClass, 'text-violet-400')} />;
        default:
            return <Bell className={cn(iconClass, 'text-primary')} />;
    }
}

// Map family → accent color classes
function getFamilyAccent(family: AppNotification['family']) {
    switch (family) {
        case 'telephely':
            return 'border-emerald-500/40 shadow-[0_0_12px_-4px_theme(colors.emerald.500)]';
        case 'szotar':
            return 'border-sky-500/40 shadow-[0_0_12px_-4px_theme(colors.sky.500)]';
        case 'szabalyok':
            return 'border-amber-500/40 shadow-[0_0_12px_-4px_theme(colors.amber.500)]';
        case 'user':
            return 'border-violet-500/40 shadow-[0_0_12px_-4px_theme(colors.violet.500)]';
        default:
            return 'border-primary/40 shadow-[0_0_12px_-4px_hsl(var(--primary))]';
    }
}

export function NotificationBanner() {
    const { notifications, dismissNotification } = useNotifications();

    if (notifications.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 mb-4">
            {notifications.map((n) => (
                <div
                    key={n.id}
                    className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-lg border',
                        'bg-background/70 backdrop-blur-xl',
                        'transition-all duration-300 ease-out',
                        getFamilyAccent(n.family),
                        n.dismissing
                            ? 'opacity-0 -translate-y-2 scale-95'
                            : 'opacity-100 translate-y-0 scale-100 animate-in slide-in-from-top-2 fade-in duration-300'
                    )}
                >
                    <FamilyIcon family={n.family} />

                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                        {n.message}
                        {n.count > 1 && (
                            <span className="ml-1.5 text-xs font-bold text-primary/80">
                                [{n.count}]
                            </span>
                        )}
                    </span>

                    <button
                        onClick={() => dismissNotification(n.id)}
                        className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                        aria-label="Értesítés bezárása"
                    >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                </div>
            ))}
        </div>
    );
}
