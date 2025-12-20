import {
  User,
  Mic,
  CreditCard,
  LogOut,
  Shield,
  Building2,
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

// Static menu item component - visibility controlled by CSS, not conditional rendering
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
            <div className="flex items-center gap-2 opacity-50 cursor-not-allowed px-2 py-1.5 text-sm w-full sidebar-menu-hover rounded-md">
              <item.icon className="h-4 w-4 shrink-0" />
              <span className={cn(
                "transition-opacity duration-200",
                collapsed ? "opacity-0 w-0" : "opacity-100"
              )}>{item.title}</span>
            </div>
          </HoverCardTrigger>
          <HoverCardContent 
            side="right" 
            align="start"
            sideOffset={8}
            alignOffset={-40}
            className="w-72 p-4 z-[100] bg-popover border border-border shadow-lg animate-in slide-in-from-left-2 duration-300"
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
          className="flex items-center gap-2 sidebar-menu-hover rounded-md transition-all duration-300"
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className={cn(
            "transition-opacity duration-200",
            collapsed ? "opacity-0 w-0" : "opacity-100"
          )}>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, signOut } = useAuth();
  const { isAdmin, isKlinikaAdmin } = useCachedRoles();
  const { isConnected: isFlexiConnected } = useFlexiConnection();
  const navigate = useNavigate();
  const collapsed = state === 'collapsed';

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
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0">
            T
          </div>
          <span className={cn(
            "text-lg font-semibold text-sidebar-foreground transition-all duration-200",
            collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}>
            TreatNote
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Főmenü - Always rendered */}
        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Főmenü</SidebarGroupLabel>
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
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Egyéb</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryMenuItems.map((item) => (
                <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin - Always rendered but hidden via CSS if no access */}
        <SidebarGroup className={cn(
          "transition-all duration-300",
          !isAdmin && "h-0 overflow-hidden opacity-0 pointer-events-none m-0 p-0"
        )}>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminMenuItems.map((item) => (
                <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Klinika - Always rendered but hidden via CSS if no access */}
        <SidebarGroup className={cn(
          "transition-all duration-300",
          !(isKlinikaAdmin || isAdmin) && "h-0 overflow-hidden opacity-0 pointer-events-none m-0 p-0"
        )}>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Klinika</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {klinikaMenuItems.map((item) => (
                <StaticMenuItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Fiók - Always rendered */}
        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Fiók</SidebarGroupLabel>
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
                  className="w-full justify-start data-[state=open]:bg-sidebar-accent sidebar-menu-hover rounded-md transition-all duration-300"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "flex flex-col items-start text-left transition-all duration-200",
                    collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
                  )}>
                    <span className="text-sm font-medium truncate max-w-[140px]">
                      {user?.email}
                    </span>
                    <span className="text-xs text-sidebar-foreground/60">
                      {getRoleText()}
                    </span>
                  </div>
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
