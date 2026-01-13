import { useState, useCallback } from 'react';
import {
  User,
  Mic,
  CreditCard,
  LogOut,
  Shield,
  Building2,
  Home,
  Loader2,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

// All menu items defined statically - no conditional rendering
const mainMenuItems = [
  { title: 'Főoldal', url: '/dashboard', icon: Home },
  { title: 'Hangfelvétel', url: '/voice-recording', icon: Mic, requiresFlexi: true, requiresSzotar: true },
];

const secondaryMenuItems = [
  { title: 'Számlázás', url: '/billing', icon: CreditCard },
];

const adminMenuItems = [
  { title: 'Admin Panel', url: '/admin', icon: Shield, requiresAdmin: true },
];

const klinikaMenuItems = [
  { title: 'Klinika Admin', url: '/klinika-admin', icon: Building2, requiresKlinikaAdmin: true },
];

const userMenuItems = [
  { title: 'Profil', url: '/profile', icon: User },
];

// Static menu item component - completely static, no animations
function StaticMenuItem({ 
  item, 
  collapsed,
  isDisabled = false,
  disabledMessage,
  disabledContent,
  onDisabledClick,
}: { 
  item: { title: string; url: string; icon: typeof User }; 
  collapsed: boolean;
  isDisabled?: boolean;
  disabledMessage?: string;
  disabledContent?: React.ReactNode;
  onDisabledClick?: () => void;
}) {
  if (isDisabled && (disabledMessage || disabledContent)) {
    return (
      <SidebarMenuItem>
        <HoverCard openDelay={0} closeDelay={200}>
          <HoverCardTrigger asChild>
            <div className="flex items-center gap-2 opacity-50 cursor-not-allowed px-2 py-1.5 text-sm w-full rounded-md">
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
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title}>
        <NavLink
          to={item.url}
          className="flex items-center gap-2 rounded-md sidebar-menu-gradient"
          activeClassName="active"
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
  const { isConnected: isFlexiConnected } = useFlexiConnection();
  const { hasSzotar, isLoading: szotarLoading } = useSzotar();
  const { admins: klinikaAdmins, isLoading: adminsLoading } = useKlinikaAdmins();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const collapsed = state === 'collapsed';
  const [generatingSzotar, setGeneratingSzotar] = useState(false);

  // Don't render content until roles are fully loaded to prevent menu jumping
  if (!isInitialized) {
    return (
      <Sidebar collapsible="icon" className="z-30">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className={cn(
            "flex items-center gap-2 py-3",
            collapsed ? "px-2 justify-center" : "px-2"
          )}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0">
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

  const userInitials = user?.email?.substring(0, 2).toUpperCase() || 'U';

  const handleFlexiLinkClick = () => {
    navigate('/profile?openFlexi=true');
  };

  // Handle clicking szotar creation link for klinika admins
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

  // Build disabled content for szotar missing
  const buildSzotarDisabledContent = () => {
    if (isKlinikaAdmin || isAdmin) {
      // Check if flexi is connected - if not, show different message
      if (!isFlexiConnected) {
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
        <p>Nem található szótár a telephelynél, kérem keresse fel klinika adminját!</p>
        <div>
          <p className="font-medium">
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
      </div>
    );
  };

  // Determine if Hangfelvétel should be disabled and why
  const getHangfelvételDisabledState = (item: typeof mainMenuItems[0]) => {
    if (!item.requiresFlexi && !item.requiresSzotar) {
      return { isDisabled: false };
    }
    
    // Check Flexi first
    if (item.requiresFlexi && !isFlexiConnected) {
      return {
        isDisabled: true,
        disabledMessage: "Jelenleg nincs hozzácsatolva FlexiDent fiók -",
        onDisabledClick: handleFlexiLinkClick,
      };
    }
    
    // Check Szotar - wait for both szotar and admins to load
    if (item.requiresSzotar && !szotarLoading && !adminsLoading && !hasSzotar) {
      return {
        isDisabled: true,
        disabledContent: buildSzotarDisabledContent(),
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

  return (
    <Sidebar collapsible="icon" className="z-30">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn(
          "flex items-center gap-2 py-3",
          collapsed ? "px-2 justify-center" : "px-2"
        )}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0">
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
                const disabledState = getHangfelvételDisabledState(item);
                return (
                  <StaticMenuItem 
                    key={item.title} 
                    item={item} 
                    collapsed={collapsed}
                    isDisabled={disabledState.isDisabled}
                    disabledMessage={disabledState.disabledMessage}
                    disabledContent={disabledState.disabledContent}
                    onDisabledClick={disabledState.onDisabledClick}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Egyéb - Always rendered */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Egyéb</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryMenuItems.map((item) => (
                <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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

        {/* Klinika - Only shown if user is klinika admin or admin */}
        {(isKlinikaAdmin || isAdmin) && (
          <SidebarGroup data-tour="sidebar-klinika">
            {!collapsed && <SidebarGroupLabel>Klinika</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {klinikaMenuItems.map((item) => (
                  <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
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
                <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className={cn(
                    "w-full data-[state=open]:bg-sidebar-accent rounded-md",
                    collapsed ? "justify-center" : "justify-start"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-medium truncate max-w-[140px]">
                        {user?.email}
                      </span>
                      <span className="text-xs text-sidebar-foreground/60">
                        {getRoleText()}
                      </span>
                    </div>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 z-[100] bg-popover border border-border">
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
