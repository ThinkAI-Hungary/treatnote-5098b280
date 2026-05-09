import { useState, useCallback, useEffect, useRef } from 'react';
import {
  User,
  Mic,
  CreditCard,
  LogOut,
  Shield,
  Building2,
  Home,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { useProfile } from '@/hooks/useProfile';
import { prefetchRoute } from '@/lib/routePrefetch';
import { usePageLoading } from '@/contexts/PageLoadingContext';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronUp as ChevronUpIcon, Building } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { notifySzotarDataChanged } from '@/lib/szotarEvents';
import { subscribeToRulesChanges } from '@/lib/rulesEvents';
import { subscribeToMembershipChanges } from '@/lib/telephelyEvents';
import { subscribeToLicenseChanges } from '@/lib/licenseEvents';
import { useNotifications } from '@/hooks/useNotifications';


// All menu items defined statically - no conditional rendering
const mainMenuItems = [
  { title: 'Főoldal', url: '/dashboard', icon: Home, tourId: 'nav-dashboard' },
  { title: 'Hangfelvétel', url: '/voice-recording', icon: Mic, requiresFlexi: true, requiresSzotar: true, tourId: 'nav-hangfelvetel' },
  { title: 'Páciensek', url: '/patients', icon: User, tourId: 'nav-patients', requiresAdmin: true },
];

const secondaryMenuItems: typeof mainMenuItems = [];

const adminMenuItems = [
  { title: 'Admin Panel', url: '/admin', icon: Shield, requiresAdmin: true, tourId: undefined },
];

const klinikaMenuItems = [
  { title: 'Klinika Admin', url: '/klinika-admin', icon: Building2, requiresKlinikaAdmin: true, tourId: 'nav-klinika-admin' },
];

const userMenuItems = [
  { title: 'Profil', url: '/profile', icon: User, tourId: 'nav-profil' },
];

// Static menu item component - completely static, no animations
function StaticMenuItem({
  item,
  collapsed,
  isDisabled = false,
  disabledMessage,
  disabledContent,
  onDisabledClick,
  tourId,
}: {
  item: { title: string; url: string; icon: typeof User };
  collapsed: boolean;
  isDisabled?: boolean;
  disabledMessage?: string;
  disabledContent?: React.ReactNode;
  onDisabledClick?: () => void;
  tourId?: string;
}) {
  if (isDisabled && (disabledMessage || disabledContent)) {
    return (
      <SidebarMenuItem data-tour={tourId}>
        <HoverCard openDelay={0} closeDelay={200}>
          <HoverCardTrigger asChild>
            <div
              onClick={onDisabledClick}
              className={cn(
                'flex items-center gap-2 opacity-50 px-2 py-1.5 text-sm w-full rounded-md',
                onDisabledClick ? 'cursor-pointer hover:opacity-75 transition-opacity' : 'cursor-not-allowed'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </div>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            sideOffset={8}
            alignOffset={-40}
            className="w-72 p-4 z-[100] bg-popover border border-border shadow-lg"
          >
            {disabledContent ? (
              disabledContent
            ) : (
              <p className="text-sm">
                {disabledMessage}{' '}
                {onDisabledClick && (
                  <button
                    onClick={onDisabledClick}
                    className="underline text-primary hover:text-primary/80 font-medium"
                  >
                    kérem csatolja hozzá fiókját itt!
                  </button>
                )}
              </p>
            )}
          </HoverCardContent>
        </HoverCard>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem data-tour={tourId}>
      <SidebarMenuButton asChild tooltip={item.title}>
        <NavLink
          to={item.url}
          className="flex items-center gap-2 rounded-md sidebar-menu-gradient"
          activeClassName="active"
          onMouseEnter={() => prefetchRoute(item.url)}
        >
          <item.icon className="h-4 w-4 shrink-0 sidebar-icon-hover" />
          {!collapsed && <span>{item.title}</span>}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const { isAdmin, isKlinikaAdmin, isInitialized } = useCachedRoles();
  const { profile } = useProfile();
  // activeTelephelyId must be computed before useFlexiConnection so we can scope it per telephely
  const activeTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection(activeTelephelyId ?? null);
  const { isPageLoading } = usePageLoading();
  const navigate = useNavigate();
  const collapsed = state === 'collapsed';
  const [generatingSzotar, setGeneratingSzotar] = useState(false);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [switching, setSwitching] = useState(false);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipRefreshTrigger, setMembershipRefreshTrigger] = useState(0);
  // Graceful shimmer: stays visible until animation cycle ends, then fades out
  const [showShimmer, setShowShimmer] = useState(false);
  const [shimmerFading, setShimmerFading] = useState(false);
  const shimmerRef = useRef<HTMLDivElement>(null);
  // Page loading shimmer — graceful exit
  const [showPageShimmer, setShowPageShimmer] = useState(false);
  const [pageShimmerFading, setPageShimmerFading] = useState(false);
  const pageShimmerRef = useRef<HTMLDivElement>(null);
  const prevMembershipCountRef = useRef<number | null>(null);
  const { addNotification } = useNotifications();
  const [hasRules, setHasRules] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  // Track when protected items first become visible so we can animate them in
  const prevShowProtectedRef = useRef(false);
  const [menuAnimKey, setMenuAnimKey] = useState(0);

  // Solo: check if the current user has an active paid license
  const isSolo = !!(profile as any)?.is_solo;
  const [hasActiveLicense, setHasActiveLicense] = useState(false);

  // Shimmer lifecycle: show immediately when loading starts, fade out gracefully when loading stops
  useEffect(() => {
    if (loadingMemberships) {
      setShimmerFading(false);
      setShowShimmer(true);
    } else if (showShimmer) {
      // Loading ended — wait for current animation cycle to finish, then fade out
      const el = shimmerRef.current;
      if (el) {
        const handleIteration = () => {
          el.removeEventListener('animationiteration', handleIteration);
          setShimmerFading(true);
          // Remove after opacity transition completes (500ms)
          setTimeout(() => setShowShimmer(false), 500);
        };
        el.addEventListener('animationiteration', handleIteration);
        // Fallback: if event doesn't fire within 2s, force fade out
        const fallback = setTimeout(() => {
          el.removeEventListener('animationiteration', handleIteration);
          setShimmerFading(true);
          setTimeout(() => setShowShimmer(false), 500);
        }, 2000);
        return () => {
          el.removeEventListener('animationiteration', handleIteration);
          clearTimeout(fallback);
        };
      } else {
        // No ref — just hide immediately
        setShowShimmer(false);
      }
    }
  }, [loadingMemberships]);

  // Track route changes so we only show shimmer on navigation, not on
  // background refetches (e.g. React Query's refetchOnWindowFocus on alt-tab).
  const recentNavRef = useRef(false);
  const navTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = location.pathname;
      recentNavRef.current = true;
      // Allow shimmer within 1s of navigation
      clearTimeout(navTimerRef.current);
      navTimerRef.current = setTimeout(() => { recentNavRef.current = false; }, 1000);
    }
    return () => clearTimeout(navTimerRef.current);
  }, [location.pathname]);

  // Page loading shimmer lifecycle:
  // Only show on actual navigation, finish current sweep before hiding.
  useEffect(() => {
    if (isPageLoading && recentNavRef.current) {
      setPageShimmerFading(false);
      setShowPageShimmer(true);
      // Reset to infinite animation when loading starts again
      const el = pageShimmerRef.current;
      if (el) {
        el.style.animationIterationCount = 'infinite';
      }
    } else if (!isPageLoading && showPageShimmer) {
      const el = pageShimmerRef.current;
      if (el) {
        // Tell CSS to stop after the CURRENT cycle ends (no new cycle starts).
        el.style.animationIterationCount = '1';
        el.style.animationFillMode = 'forwards';

        const handleEnd = () => {
          el.removeEventListener('animationend', handleEnd);
          setPageShimmerFading(true);
          setTimeout(() => setShowPageShimmer(false), 500);
        };
        el.addEventListener('animationend', handleEnd);

        // Fallback in case animationend doesn't fire
        const fallback = setTimeout(() => {
          el.removeEventListener('animationend', handleEnd);
          setPageShimmerFading(true);
          setTimeout(() => setShowPageShimmer(false), 500);
        }, 2000);

        return () => {
          el.removeEventListener('animationend', handleEnd);
          clearTimeout(fallback);
        };
      } else {
        setShowPageShimmer(false);
      }
    }
  }, [isPageLoading]);

  const { hasSzotar, hasProbaPaciens, hasFlexiDomain, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins, isLoading: adminsLoading } = useKlinikaAdmins();
  const depsInitialLoadRef = useRef(true);

  // Solo license check + realtime subscription so Hangfelvétel gate updates
  // immediately when a license is bought, expires, or is terminated.
  // We check by assigned_user_id + company_id only (not telephely_id) because:
  //   1. solo companies typically have one telephely, so the scope is equivalent
  //   2. the license's telephely_id may not always match current_telephely_id exactly
  // Realtime uses company_id filter (stable; telephely_id=null after termination isn't stable).
  useEffect(() => {
    if (!user || !isSolo) return;
    const companyId = profile?.company_id;
    const checkLicense = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('licenses')
        .select('id, expires_at')
        .eq('assigned_user_id', user.id)
        .eq('status', 'assigned')
        .neq('license_type', 'trial')
        .limit(1);
      const row = (data ?? [])[0];
      setHasActiveLicense(!!row && (row.expires_at === null || row.expires_at > now));
    };
    checkLicense();
    if (!companyId) return;
    const channel = supabase
      .channel(`sidebar-license-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'licenses', filter: `company_id=eq.${companyId}` }, () => checkLicense())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isSolo, profile?.company_id]);

  // Immediately re-check license when ElofizetesTab fires the cancel event
  // (before the Stripe webhook updates the DB)
  useEffect(() => {
    if (!user || !isSolo) return;
    const recheck = async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from('licenses')
        .select('id, expires_at')
        .eq('assigned_user_id', user.id)
        .eq('status', 'assigned')
        .neq('license_type', 'trial')
        .limit(1);
      const row = (data ?? [])[0];
      setHasActiveLicense(!!row && (row.expires_at === null || row.expires_at > now));
    };
    return subscribeToLicenseChanges(recheck);
  }, [user, isSolo]);

  // Launch Stripe checkout for solo users without a license
  const handleBuySoloLicense = useCallback(async () => {
    const companyId = profile?.company_id;
    const telephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;
    if (!companyId) return;
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { company_id: companyId, price_id: 'price_1TABODDG9IVOU80sYHim2VsD', seats: 1, telephely_id: telephelyId },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast.error('Hiba a fizetési oldal megnyitásakor: ' + (err.message || 'Ismeretlen hiba'));
    }
  }, [profile]);

  // Fetch treatment_rules count for the active telephely
  useEffect(() => {
    async function fetchRules() {
      if (!activeTelephelyId) { setHasRules(false); setRulesLoading(false); return; }
      try {
        const { count } = await supabase
          .from('treatment_rules')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', activeTelephelyId);
        setHasRules((count || 0) > 0);
      } catch { setHasRules(false); }
      finally { setRulesLoading(false); }
    }
    fetchRules();
  }, [activeTelephelyId]);

  // Re-fetch rules when a generation completes (from any page)
  useEffect(() => {
    const unsubscribe = subscribeToRulesChanges(() => {
      if (!activeTelephelyId) return;
      (async () => {
        try {
          const { count } = await supabase
            .from('treatment_rules')
            .select('id', { count: 'exact', head: true })
            .eq('clinic_id', activeTelephelyId);
          setHasRules((count || 0) > 0);
        } catch { /* ignore */ }
      })();
    });
    return unsubscribe;
  }, [activeTelephelyId]);

  // Fetch all telephely memberships for the user
  useEffect(() => {
    if (!user) return;

    const fetchMemberships = async (isRealtimeUpdate = false) => {
      setLoadingMemberships(true);
      console.log('Fetching memberships for user:', user.id);

      // 1. Fetch memberships only (no joins to avoid RLS issues)
      const { data: rawMemberships, error: memError } = await supabase
        .from('telephely_memberships')
        .select('*')
        .eq('user_id', user.id);

      if (memError) {
        console.error('Error fetching memberships:', memError);
        setLoadingMemberships(false);
        return;
      }

      if (!rawMemberships || rawMemberships.length === 0) {
        console.warn('No memberships found for user');
        setMemberships([]);
        setLoadingMemberships(false);
        return;
      }

      // 2. Fetch telephely details for these memberships
      const telephelyIds = rawMemberships.map(m => m.telephely_id);

      // Try with company join first
      const { data: telephelyData, error: telError } = await supabase
        .from('telephely')
        .select('id, name, display_name, company_id, company:companies(name, display_name)')
        .in('id', telephelyIds);

      if (telError) {
        console.error('Error fetching telephely details with company:', telError);

        // Fallback: Try without company join
        const { data: telephelyDataSimple, error: telErrorSimple } = await supabase
          .from('telephely')
          .select('id, name, company_id')
          .in('id', telephelyIds);

        if (telErrorSimple) {
          console.error('Telephely fetch error:', telErrorSimple);
          setLoadingMemberships(false);
          return;
        }

        // Combine with simplistic data
        const combined = rawMemberships.map(m => {
          const t = telephelyDataSimple?.find(t => t.id === m.telephely_id);
          return {
            ...m,
            telephely: {
              name: t?.name || 'Unknown',
              display_name: null,
              company: { name: 'TreatNote', display_name: null } // Fallback company name
            }
          };
        });
        setMemberships(combined);
        setLoadingMemberships(false);
        return;
      }

      // 3. Combine full data
      const combined = rawMemberships.map(m => {
        const t = telephelyData.find(t => t.id === m.telephely_id);
        return {
          ...m,
          telephely: {
            name: t?.name || 'Unknown',
            display_name: (t as any)?.display_name || null,
            company: t?.company || { name: 'TreatNote', display_name: null }
          }
        };
      });

      console.log('Fetched memberships (combined):', combined);

      // Detect new telephely connection
      if (prevMembershipCountRef.current !== null && combined.length > prevMembershipCountRef.current && isRealtimeUpdate) {
        const newOnes = combined.slice(prevMembershipCountRef.current);
        const newName = newOnes[newOnes.length - 1]?.telephely?.name || 'Ismeretlen';
        addNotification('telephely', `Új telephely csatlakoztatva: ${newName}`);
      }
      prevMembershipCountRef.current = combined.length;

      setMemberships(combined);
      setLoadingMemberships(false);
    };

    fetchMemberships();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('sidebar-memberships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'telephely_memberships',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchMemberships(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, (profile as any)?.current_telephely_id, membershipRefreshTrigger]);

  // Listen for membership change event (invitation accepted) and poll for new membership
  useEffect(() => {
    let pollingTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const baselineCount = prevMembershipCountRef.current;

    const startPolling = () => {
      setLoadingMemberships(true);

      // Poll every 5 seconds
      pollingTimer = setInterval(async () => {
        if (!user) return;

        const { data: rawMemberships, error } = await supabase
          .from('telephely_memberships')
          .select('*')
          .eq('user_id', user.id);

        if (error || !rawMemberships) return;

        // Check if membership count increased from baseline
        if (baselineCount !== null && rawMemberships.length > baselineCount) {
          // Found new membership! Fetch full details
          const telephelyIds = rawMemberships.map(m => m.telephely_id);
          const { data: telephelyData } = await supabase
            .from('telephely')
            .select('id, name, company_id, company:companies(name)')
            .in('id', telephelyIds);

          const combined = rawMemberships.map(m => {
            const t = telephelyData?.find(t => t.id === m.telephely_id);
            return {
              ...m,
              telephely: {
                name: t?.name || 'Unknown',
                company: t?.company || { name: 'TreatNote' }
              }
            };
          });

          // Find the new telephely name
          const newName = combined[combined.length - 1]?.telephely?.name || 'Ismeretlen';
          addNotification('telephely', `Új telephely csatlakoztatva: ${newName}`);
          toast.success(`Sikeresen csatlakoztál: ${newName}`);

          prevMembershipCountRef.current = combined.length;
          setMemberships(combined);
          setLoadingMemberships(false);

          // Stop polling
          if (pollingTimer) clearInterval(pollingTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
        }
      }, 5000);

      // Timeout after 3 minutes
      timeoutTimer = setTimeout(() => {
        if (pollingTimer) clearInterval(pollingTimer);
        setLoadingMemberships(false);
      }, 3 * 60 * 1000);
    };

    const unsubscribe = subscribeToMembershipChanges(startPolling);

    return () => {
      unsubscribe();
      if (pollingTimer) clearInterval(pollingTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [user, addNotification]);

  // Re-fetch memberships when the profile page saves display name changes
  useEffect(() => {
    const handler = () => setMembershipRefreshTrigger(t => t + 1);
    window.addEventListener('profile-saved', handler);
    return () => window.removeEventListener('profile-saved', handler);
  }, []);

  const handleSwitchTelephely = async (telephelyId: string) => {
    if (telephelyId === (profile as any)?.current_telephely_id) return;

    setSwitching(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ current_telephely_id: telephelyId })
        .eq('user_id', user?.id);

      if (error) throw error;

      toast.success('Telephely sikeresen váltva');
      window.location.reload(); // Reload to refresh all data context
    } catch (error) {
      console.error('Error switching telephely:', error);
      toast.error('Hiba a telephely váltásakor');
    } finally {
      setSwitching(false);
    }
  };

  let currentMembership = memberships.find(m => m.telephely_id === (profile as any)?.current_telephely_id);

  // Auto-select first membership if none selected or selected is invalid
  if (!currentMembership && memberships.length > 0) {
    currentMembership = memberships[0];
  }

  // Strip trailing numeric suffix from slugs (e.g. "zombori.mark-4" → "zombori.mark")
  const stripSuffix = (s: string) => s.replace(/-\d+$/, '');

  const currentOrgName = (currentMembership?.telephely?.company as any)?.display_name
    || stripSuffix(currentMembership?.telephely?.company?.name || '')
    || '—';
  const currentTelephelyName = (currentMembership?.telephely as any)?.display_name
    || stripSuffix((currentMembership?.telephely as any)?.name || '')
    || '—';

  const handleFlexiLinkClick = useCallback(() => {
    navigate('/profile?openFlexi=true');
  }, [navigate]);

  const handleProbaPaciensClick = useCallback(() => {
    navigate('/klinika-admin?tab=szotar&openProba=true');
  }, [navigate]);

  const handleDomainClick = useCallback(() => {
    navigate('/klinika-admin?tab=szotar&openDomain=true');
  }, [navigate]);

  // Handle clicking szotar creation link for klinika admins - must be before early return
  const handleSzotarCreationClick = useCallback(async () => {
    if (!profile?.telephely_id || !profile?.company_id || !user) {
      navigate('/klinika-admin?tab=szotar');
      return;
    }

    setGeneratingSzotar(true);
    try {
      const { data, error } = await supabase.functions.invoke('szotar-webhook', {
        body: {
          telephely_id: profile.telephely_id,
          company_id: profile.company_id,
          user_id: user.id,
          regenerate: false,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Szótár készítése elindítva!');
        // Kick the sidebar's szótár polling/refresh (realtime can be flaky)
        notifySzotarDataChanged();
      } else {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }
    } catch (err: any) {
      console.error('Error generating szotar:', err);
      toast.error('Hiba a szótár generálásakor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setGeneratingSzotar(false);
      navigate('/klinika-admin?tab=szotar');
    }
  }, [profile, user, navigate]);

  // Determine if all 5 onboarding steps are done (must be before early return — hooks below must always run)
  const allOnboardingComplete = hasFlexiDomain && hasProbaPaciens && isFlexiConnected && hasSzotar && hasRules;
  const showProtectedItems = allOnboardingComplete;

  // Bump animKey whenever protected items first become visible → triggers CSS float-in animation
  // Must be before the early return so the hook always runs every render.
  useEffect(() => {
    if (showProtectedItems && !prevShowProtectedRef.current) {
      setMenuAnimKey(k => k + 1);
    }
    prevShowProtectedRef.current = showProtectedItems;
  }, [showProtectedItems]);

  const depsCurrentlyLoading = szotarLoading || adminsLoading || rulesLoading || isFlexiLoading;

  if (depsCurrentlyLoading && depsInitialLoadRef.current) {
    return (
      <Sidebar collapsible="icon" className="z-30">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className={cn(
            "flex items-center gap-2 py-3",
            collapsed ? "px-2 justify-center" : "px-2"
          )}>
            <div className="flex select-none h-8 w-8 items-center justify-center rounded-lg primary-btn-gradient dark:bg-primary dark:text-primary-foreground font-bold shrink-0 text-[hsl(262_48%_16%)] dark:text-white">
              T
            </div>
            {!collapsed && (
              <span className="text-lg font-semibold text-sidebar-foreground">
                TreatNote
              </span>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="flex items-center justify-center h-full opacity-50">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  // Once we get past the loading screen, lock the initial load state so we never return to the spinner
  if (!depsCurrentlyLoading && depsInitialLoadRef.current) {
    depsInitialLoadRef.current = false;
  }

  const userInitials = user?.email?.substring(0, 2).toUpperCase() || 'U';

  // Helper to render admin contact info for normal users
  const renderAdminContactInfo = () => (
    <div className="mt-2">
      <p className="font-medium">
        {klinikaAdmins.length > 1
          ? 'Kérem a probléma megoldása érdekében keresse fel a klinika adminjait:'
          : 'Kérem a probléma megoldása érdekében keresse fel a klinika adminját:'}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {klinikaAdmins.length > 1 ? 'Klinika adminok:' : 'Klinika admin:'}
      </p>
      {klinikaAdmins.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {klinikaAdmins.map((admin) => (
            <li key={admin.id} className="text-muted-foreground">
              {admin.full_name || 'Névtelen'}
              {admin.phone ? ` - ${admin.phone}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">Nincs klinika admin a telephelyen</p>
      )}
    </div>
  );

  // Build disabled content based on what's missing (in priority order: Domain → Flexi → Próba → Szótár → Rules)
  const buildHangfelvételDisabledContent = (reason: 'domain' | 'flexi' | 'proba' | 'szotar' | 'rules' | 'license') => {
    if (reason === 'license') {
      return (
        <p className="text-sm">
          <button
            onClick={handleBuySoloLicense}
            className="underline text-primary hover:text-primary/80 font-medium"
          >
            Vásároljon licenset a hangfelvétel használatához.
          </button>
        </p>
      );
    }

    if (reason === 'domain') {
      if (isKlinikaAdmin || isAdmin) {
        return (
          <p className="text-sm">
            <button
              onClick={handleDomainClick}
              className="underline text-primary hover:text-primary/80 font-medium"
            >
              Kérem állítsa be a klinika FlexiDent domain-jét
            </button>
            {' '}a folytatáshoz.
          </p>
        );
      }
      return (
        <div className="text-sm space-y-2">
          <p>Nincs beállítva a klinika FlexiDent domain-je.</p>
          {renderAdminContactInfo()}
        </div>
      );
    }

    if (reason === 'flexi') {
      return (
        <p className="text-sm">
          Jelenleg nincs hozzácsatolva FlexiDent fiók -{' '}
          <button
            onClick={handleFlexiLinkClick}
            className="underline text-primary hover:text-primary/80 font-medium"
          >
            kérem csatolja hozzá fiókját itt!
          </button>
        </p>
      );
    }

    if (reason === 'proba') {
      if (isKlinikaAdmin || isAdmin) {
        return (
          <p className="text-sm">
            <button
              onClick={handleProbaPaciensClick}
              className="underline text-primary hover:text-primary/80 font-medium"
            >
              Kérem adjon meg egy próba páciens nevet
            </button>
            {' '}az elengedhetetlen tesztek futtatásához.
          </p>
        );
      }
      return (
        <div className="text-sm space-y-2">
          <p>Kérem adjon meg egy próba páciens nevet az elengedhetetlen tesztek futtatásához.</p>
          {renderAdminContactInfo()}
        </div>
      );
    }

    // reason === 'szotar'
    if (reason === 'szotar') {
      if (isKlinikaAdmin || isAdmin) {
        return (
          <div className="text-sm">
            <p>
              Nem található szótár a telephelynél -{' '}
              <button
                onClick={handleSzotarCreationClick}
                disabled={generatingSzotar}
                className="underline text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1"
              >
                {generatingSzotar && <Loader2 className="h-3 w-3 animate-spin" />}
                kattintson ide a létrehozáshoz
              </button>
            </p>
          </div>
        );
      }

      return (
        <div className="text-sm space-y-2">
          <p>Nem található szótár a telephelynél.</p>
          {renderAdminContactInfo()}
        </div>
      );
    }

    // reason === 'rules'
    if (reason === 'rules') {
      if (isKlinikaAdmin || isAdmin) {
        return (
          <div className="text-sm">
            <p>
              Még nincsenek kezelési szabályok –{' '}
              <button
                onClick={() => navigate('/klinika-admin?tab=kezelesi-szabalyok')}
                className="underline text-primary hover:text-primary/80 font-medium"
              >
                generálja le a szabályokat a szótárból
              </button>
            </p>
          </div>
        );
      }

      return (
        <div className="text-sm space-y-2">
          <p>Még nincsenek kezelési szabályok.</p>
          {renderAdminContactInfo()}
        </div>
      );
    }

    return null; // Should not happen if all reasons are handled
  };

  // Determine if Hangfelvétel should be disabled and why (check in order: Domain → Flexi → Próba → Szótár)
  const getHangfelvételDisabledState = (item: typeof mainMenuItems[0]) => {
    if (!item.requiresFlexi && !item.requiresSzotar) {
      return { isDisabled: false };
    }

    // Solo shortcut: only gate on license, skip all other checks
    if (isSolo) {
      if (!hasActiveLicense) {
        return { isDisabled: true, disabledContent: buildHangfelvételDisabledContent('license') };
      }
      return { isDisabled: false };
    }

    // 1. Check Domain first
    if (item.requiresSzotar && !szotarLoading && !adminsLoading && !hasFlexiDomain) {
      return {
        isDisabled: true,
        disabledContent: buildHangfelvételDisabledContent('domain'),
      };
    }

    // 2. Check Flexi second
    if (item.requiresFlexi && !isFlexiConnected) {
      return {
        isDisabled: true,
        disabledContent: buildHangfelvételDisabledContent('flexi'),
      };
    }

    // 3. Check Próba páciens third
    if (item.requiresSzotar && !szotarLoading && !adminsLoading && !hasProbaPaciens) {
      return {
        isDisabled: true,
        disabledContent: buildHangfelvételDisabledContent('proba'),
      };
    }

    // 4. Check Szotar fourth
    if (item.requiresSzotar && !szotarLoading && !adminsLoading && !hasSzotar) {
      return {
        isDisabled: true,
        disabledContent: buildHangfelvételDisabledContent('szotar'),
      };
    }

    // 5. Check Rules fifth
    if (item.requiresSzotar && !rulesLoading && !hasRules) {
      return {
        isDisabled: true,
        disabledContent: buildHangfelvételDisabledContent('rules'),
      };
    }

    return { isDisabled: false };
  };

  // Determine user role text
  const getRoleText = () => {
    if (isAdmin) return 'Admin';
    if (isKlinikaAdmin) return 'Klinika Admin';
    return 'Felhasználó';
  };

  // Build disabled content for Klinika Admin menu item
  const buildKlinikaAdminDisabledContent = () => {
    const missingSteps: string[] = [];
    if (!hasFlexiDomain) missingSteps.push('FlexiDent domain beállítása');
    if (!hasProbaPaciens) missingSteps.push('Próba páciens ID megadása');
    if (!isFlexiConnected) missingSteps.push('FlexiDent fiók csatlakoztatása');
    if (!hasSzotar) missingSteps.push('Szótár generálása');
    if (!hasRules) missingSteps.push('Szabályok generálása szótárból');

    if (isKlinikaAdmin || isAdmin) {
      return (
        <div className="text-sm space-y-2">
          <p>Kérjük, először végezze el a beállítási lépéseket a <button onClick={() => navigate('/dashboard')} className="underline text-primary hover:text-primary/80 font-medium">Főoldalon</button>:</p>
          <ul className="list-disc ml-4 space-y-0.5 text-muted-foreground">
            {missingSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      );
    }

    return (
      <div className="text-sm space-y-2">
        <p>Kérjük, először végezze el a beállítási lépéseket a <button onClick={() => navigate('/dashboard')} className="underline text-primary hover:text-primary/80 font-medium">Főoldalon</button>.</p>
        <p className="text-muted-foreground">Egyes lépéseket a Klinika Admin végezhet el:</p>
        <ul className="list-disc ml-4 space-y-0.5 text-muted-foreground">
          {missingSteps.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
        {renderAdminContactInfo()}
      </div>
    );
  };

  return (
    <Sidebar collapsible="icon" className="z-30">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn(
          "flex items-center gap-2 py-3",
          collapsed ? "px-2 justify-center" : "px-2"
        )}>
          <div className="flex select-none h-8 w-8 items-center justify-center rounded-lg primary-btn-gradient dark:bg-primary dark:text-primary-foreground font-bold shrink-0 text-[hsl(262_48%_16%)] dark:text-white">
            T
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-sidebar-foreground">
              TreatNote
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="animate-fade-in">
        {/* Főmenü - Always rendered */}
        <SidebarGroup data-tour="sidebar-main">
          {!collapsed && <SidebarGroupLabel>Főmenü</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                // For now, Páciensek menu is restricted to admin only per user request
                if (item.requiresAdmin && !isAdmin) return null;

                if (item.requiresFlexi || item.requiresSzotar) {
                  // Solo: always show, gated only on license
                  if (isSolo) {
                    const { isDisabled, disabledContent } = getHangfelvételDisabledState(item);
                    return (
                      <StaticMenuItem
                        key={`${item.title}-solo`}
                        item={item}
                        collapsed={collapsed}
                        tourId={(item as any).tourId}
                        isDisabled={isDisabled}
                        disabledContent={disabledContent}
                        onDisabledClick={isDisabled ? handleBuySoloLicense : undefined}
                      />
                    );
                  }
                  // Non-solo: hide entirely when onboarding incomplete
                  if (!showProtectedItems) return null;
                  return (
                    <StaticMenuItem
                      key={`${item.title}-${menuAnimKey}`}
                      item={item}
                      collapsed={collapsed}
                      tourId={(item as any).tourId}
                    />
                  );
                }
                return (
                  <StaticMenuItem
                    key={item.title}
                    item={item}
                    collapsed={collapsed}
                    tourId={(item as any).tourId}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Egyéb - Hidden (moved to Klinika Admin) */}

        {/* Admin - Only shown if user is admin */}
        {isAdmin && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Admin</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => (
                  <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Test Suite - Only shown for zsolt@gmail.com */}
        {user?.email === 'zsolt@gmail.com' && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Teszt</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                <StaticMenuItem
                  item={{ title: 'Test Suite', url: '/test-suite', icon: FlaskConical }}
                  collapsed={collapsed}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Klinika - Only shown if user is klinika admin or admin AND onboarding complete */}
        {(isKlinikaAdmin || isAdmin) && showProtectedItems && (
          <SidebarGroup
            key={`klinika-${menuAnimKey}`}
            data-tour="sidebar-klinika"
            className="menu-float-in"
          >
            {!collapsed && <SidebarGroupLabel>Klinika</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {klinikaMenuItems.map((item) => (
                  <StaticMenuItem
                    key={item.title}
                    item={item}
                    collapsed={collapsed}
                    tourId={(item as any).tourId}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fiók - Always rendered */}
        <SidebarGroup data-tour="sidebar-profile">
          {!collapsed && <SidebarGroupLabel>Fiók</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {userMenuItems.map((item) => (
                <StaticMenuItem
                  key={item.title}
                  item={item}
                  collapsed={collapsed}
                  tourId={(item as any).tourId}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Loading indicator above user panel */}
      {showShimmer && (
        <div className={cn(
          "mx-3 mb-0 transition-opacity duration-500",
          shimmerFading ? "opacity-0" : "opacity-100"
        )}>
          <div className="h-0.5 rounded-full overflow-hidden bg-sidebar-accent/20">
            <div
              ref={shimmerRef}
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-accent to-primary animate-[shimmer_1.5s_ease-in-out_infinite]"
            />
          </div>
        </div>
      )}

      {/* Page loading indicator — shimmer bar with graceful exit */}
      {showPageShimmer && (
        <div
          className="px-3 py-1.5 transition-opacity duration-500"
          style={{ opacity: pageShimmerFading ? 0 : 1 }}
        >
          <div className="h-0.5 rounded-full overflow-hidden bg-sidebar-accent/20">
            <div
              ref={pageShimmerRef}
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-accent to-primary animate-[shimmer_1.5s_ease-in-out_infinite]"
            />
          </div>
        </div>
      )}

      <SidebarFooter className="border-t border-sidebar-border gap-2 p-2">

        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className={cn(
                    "w-full h-auto py-2 data-[state=open]:bg-sidebar-accent rounded-md",
                    collapsed ? "justify-center" : "justify-start"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src="" />
                    <AvatarFallback className="primary-btn-gradient dark:bg-primary dark:text-primary-foreground text-xs text-[hsl(262_48%_16%)] dark:text-white border-0">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-col items-start text-left flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[11px] text-primary w-full mb-0.5">
                        <Building className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{currentOrgName} / {currentTelephelyName}</span>
                      </div>
                      <span className="text-sm font-medium truncate w-full">
                        {user?.email}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-bold">
                        {getRoleText()}
                      </span>
                    </div>
                  )}
                  {!collapsed && memberships.length > 1 && (
                    <ChevronUpIcon className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 z-[100] bg-popover border border-border">
                {memberships.length > 1 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-border/50">
                      Telephely váltás
                    </div>
                    {memberships.map((m) => (
                      <DropdownMenuItem
                        key={m.telephely_id}
                        onClick={() => handleSwitchTelephely(m.telephely_id)}
                        disabled={switching || m.telephely_id === (profile as any)?.current_telephely_id}
                        className={cn(
                          "text-xs flex items-center justify-between",
                          m.telephely_id === (profile as any)?.current_telephely_id && "bg-primary/10 text-primary"
                        )}
                      >
                        <span className="truncate">{m.telephely.name}</span>
                        {m.telephely_id === (profile as any)?.current_telephely_id && (
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Kijelentkezés
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
