import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { InvitationBanner } from '@/components/InvitationBanner';
import { NotificationBanner } from '@/components/NotificationBanner';
import { NotificationProvider } from '@/hooks/useNotifications';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { PageLoader } from '@/components/PageLoader';
import { PageTransition } from '@/components/PageTransition';
import { PageLoadingProvider } from '@/contexts/PageLoadingContext';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}



import { Sun, Moon, Info, CheckCircle2, AlertCircle, Share2, Check, X, MinusCircle, Bell } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { AnimatePresence, motion } from 'framer-motion';
import { useHeaderMessage } from '@/hooks/useHeaderMessage';
import { useShareRequestsStore, formatSender } from '@/hooks/useShareRequestsStore';
import { toast } from '@/hooks/useToastMessage';

// Separate header component — reads from Zustand store (single source of truth)
function LayoutHeader() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { message, type, history: notifHistory, clearHistory, markAllRead, lastReadAt } = useHeaderMessage();
  const { incoming, acceptRequest, rejectRequest, dismissedIds, dismissBanner } = useShareRequestsStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Filter out dismissed notifications for the header — they remain in Értesítések tab
  const visibleIncoming = incoming.filter(r => !dismissedIds.has(r.id));
  const pendingRequest = visibleIncoming[0] ?? null;
  const pendingCount = visibleIncoming.length;

  const handleAccept = async () => {
    if (!pendingRequest || !user) return;
    setProcessing(pendingRequest.id);
    const ok = await acceptRequest(pendingRequest.id, pendingRequest.patient_id, user.id);
    setProcessing(null);
    if (ok) toast.success('Páciens megosztás elfogadva!');
    else toast.error('Hiba az elfogadáskor.');
  };

  const handleReject = async () => {
    if (!pendingRequest || !user) return;
    setProcessing(pendingRequest.id);
    const ok = await rejectRequest(pendingRequest.id, pendingRequest.patient_id, user.id);
    setProcessing(null);
    if (ok) toast.info('Megosztási kérelem elutasítva.');
    else toast.error('Hiba az elutasításkor.');
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
      </div>

      {/* Center: Share request banner (priority) or animated header message */}
      <div className="flex-1 flex justify-center overflow-hidden px-4">
        <AnimatePresence mode="wait">
          {pendingRequest ? (
            <motion.div
              key={`share-${pendingRequest.id}`}
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => navigate('/patients', { state: { tab: 'notifications' } })}
              className="flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium shadow-sm border bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-300 dark:bg-violet-500/20 cursor-pointer hover:bg-violet-500/20 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[260px]">
                <span className="font-semibold">{formatSender(pendingRequest)}</span>
                {' – '}
                <span>{pendingRequest.patient_name}</span>
              </span>
              {pendingCount > 1 && (
                <span className="text-xs bg-violet-500/20 px-1.5 py-0.5 rounded-full">
                  +{pendingCount - 1}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleReject(); }}
                disabled={!!processing}
                className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0"
                title="Elutasít"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleAccept(); }}
                disabled={!!processing}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400 transition-colors shrink-0"
                title="Elfogad"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); dismissBanner(pendingRequest.id); }}
                disabled={!!processing}
                className="flex items-center gap-1.5 h-6 px-2 rounded-full text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shrink-0"
                title="Mellőzés — az Értesítések tabban később kezelheti"
              >
                <MinusCircle className="h-3.5 w-3.5" />
                Mellőzés
              </button>
            </motion.div>
          ) : message ? (
            <motion.div
              key="header-message"
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium shadow-sm border ${type === 'success' ? 'bg-green-500/10 text-green-600 border-green-500/20 dark:bg-green-500/20 dark:text-green-400' :
                  type === 'error' ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400' :
                    'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400'
                }`}
            >
              {type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {type === 'error' && <AlertCircle className="h-4 w-4" />}
              {type === 'info' && <Info className="h-4 w-4" />}
              {message}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Right: taskbar actions */}
      <div className="flex items-center gap-1">
        {/* Notification history button */}
        <div className="relative">
          <button
            onClick={() => {
              const opening = !notifOpen;
              setNotifOpen(opening);
              if (opening) markAllRead();
            }}
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors duration-200"
            aria-label="Értesítés előzmények"
            title="Értesítés előzmények"
          >
            <Bell className="h-4 w-4" />
            {notifHistory.some(e => e.type === 'error' && e.timestamp.getTime() > lastReadAt) && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-10 z-40 w-80 rounded-xl border bg-popover shadow-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <span className="text-sm font-semibold">Értesítés előzmények</span>
                  {notifHistory.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Törlés
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y">
                  {notifHistory.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nincsenek értesítések
                    </div>
                  ) : (
                    notifHistory.map(entry => (
                      <div key={entry.id} className="px-4 py-2.5 flex items-start gap-2.5">
                        {entry.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />}
                        {entry.type === 'error' && <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />}
                        {entry.type === 'info' && <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs leading-snug break-words">{entry.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {entry.timestamp.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Info button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('taskbar-info'))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors duration-200"
          aria-label="Információ"
          title="Információ"
        >
          <Info className="h-4 w-4" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors duration-200"
          aria-label={isDark ? 'Világos mód' : 'Sötét mód'}
          title={isDark ? 'Váltás világos módra' : 'Váltás sötét módra'}
        >
          <Sun className={`absolute h-4 w-4 transition-all duration-500 ${isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'}`} />
          <Moon className={`absolute h-4 w-4 transition-all duration-500 ${isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} />
        </button>
      </div>
    </header>
  );
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);
  const { fetchRequests } = useShareRequestsStore();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  // Wait a single frame after auth to ensure paint-readiness (≈16ms vs old 100ms)
  useEffect(() => {
    if (!loading && user) {
      const id = requestAnimationFrame(() => setIsReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [loading, user]);

  // Initialize share requests store + realtime once user is known (single source of truth for all components)
  useEffect(() => {
    if (!user) return;
    fetchRequests(user.id);

    // Realtime subscription for instant updates
    const channel = supabase
      .channel(`share_requests_global_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_share_requests' }, () => {
        fetchRequests(user.id);
      })
      .subscribe();

    // Polling fallback every 15s in case realtime is slow to connect
    const pollInterval = setInterval(() => fetchRequests(user.id), 15_000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading || !isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <NotificationProvider>
      <PageLoadingProvider>
        <SidebarProvider>
          {/* Gradient is on body with background-attachment:fixed — transparent wrapper so it shows through */}
          <div className="min-h-screen flex w-full relative">
            {/* Background flowing colors */}
            <BackgroundEffects />

            <AppSidebar />
            <SidebarInset className="flex-1 relative z-10 !bg-transparent dark:!bg-background min-w-0">
              <LayoutHeader />
              <main className="flex-1 p-6 overflow-x-hidden min-w-0">
                <NotificationBanner />
                <InvitationBanner />
                {/* Smooth page transition on every route change */}
                <PageTransition>
                  {children}
                </PageTransition>
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </PageLoadingProvider>
    </NotificationProvider>
  );
}


