import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { InvitationBanner } from '@/components/InvitationBanner';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { PageLoader } from '@/components/PageLoader';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

// Separate header component that uses sidebar context
function LayoutHeader() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className={collapsed ? "ml-0" : "-ml-1"} />
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

  // Wait a tick after auth loading is done to ensure everything is ready
  useEffect(() => {
    if (!loading && user) {
      // Small delay to ensure all data is loaded before showing content
      const timer = setTimeout(() => {
        setIsReady(true);
      }, 100);
      return () => clearTimeout(timer);
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
    <SidebarProvider>
      <div className="min-h-screen flex w-full relative">
        {/* Background flowing colors */}
        <BackgroundEffects />
        
        <AppSidebar />
        <SidebarInset className="flex-1 relative z-10">
          <LayoutHeader />
          <main className="flex-1 p-6">
            <InvitationBanner />
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
