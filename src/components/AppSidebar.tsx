import {
  User,
  Mic,
  CreditCard,
  LogOut,
  Shield,
  Building2,
  Home,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useNavigate } from 'react-router-dom';
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
  { title: 'Hangfelvétel', url: '/voice-recording', icon: Mic, requiresFlexi: true },
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
  onDisabledClick,
}: { 
  item: { title: string; url: string; icon: typeof User }; 
  collapsed: boolean;
  isDisabled?: boolean;
  disabledMessage?: string;
  onDisabledClick?: () => void;
}) {
  if (isDisabled && disabledMessage) {
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
  const navigate = useNavigate();
  const collapsed = state === 'collapsed';

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
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Főmenü</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <StaticMenuItem 
                  key={item.title} 
                  item={item} 
                  collapsed={collapsed}
                  isDisabled={item.requiresFlexi && !isFlexiConnected}
                  disabledMessage={item.requiresFlexi ? "Jelenleg nincs hozzácsatolva FlexiDent fiók -" : undefined}
                  onDisabledClick={item.requiresFlexi ? handleFlexiLinkClick : undefined}
                />
              ))}
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
          <SidebarGroup>
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
        <SidebarGroup>
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
