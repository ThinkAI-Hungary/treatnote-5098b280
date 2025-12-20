import { ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { InvitationBanner } from '@/components/InvitationBanner';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { PageLoader } from '@/components/PageLoader';

interface LayoutProps {
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

export function Layout({ children }: LayoutProps) {
  const { user, loading } = useAuth();
  const { isInitialized: rolesInitialized } = useCachedRoles();
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Wait for auth AND roles to be loaded before showing content
  useEffect(() => {
    if (!loading && user && rolesInitialized) {
      setIsReady(true);
    }
  }, [loading, user, rolesInitialized]);

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
