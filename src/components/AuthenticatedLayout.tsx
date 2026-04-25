import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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



import { Sun, Moon, Info } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

// Separate header component that uses sidebar context
function LayoutHeader() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-2">
        <SidebarTrigger className={collapsed ? 'ml-0' : '-ml-1'} />
      </div>

      {/* Right: taskbar actions */}
      <div className="flex items-center gap-1">
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
            <SidebarInset className="flex-1 relative z-10 !bg-transparent dark:!bg-background">
              <LayoutHeader />
              <main className="flex-1 p-6">
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


