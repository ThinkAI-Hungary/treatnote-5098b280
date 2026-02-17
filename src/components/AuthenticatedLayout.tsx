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



// Separate header component that uses sidebar context
function LayoutHeader() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <SidebarTrigger className={collapsed ? "ml-0" : "-ml-1"} />
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
      navigate('/auth');
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
          <div className="min-h-screen flex w-full relative">
            {/* Background flowing colors */}
            <BackgroundEffects />

            <AppSidebar />
            <SidebarInset className="flex-1 relative z-10">
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


