import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Settings,
  User,
  Mic,
  Download,
  CreditCard,
  BarChart3,
  LogOut,
  Shield,
  Stethoscope,
  Grid3X3,
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

const mainNavItems: { title: string; url: string; icon: typeof LayoutDashboard }[] = [];

const secondaryNavItems = [
  { title: 'Számlázás', url: '/billing', icon: CreditCard },
];

const userNavItems = [
  { title: 'Profil', url: '/profile', icon: User },
];

// Menu item component with smooth hover effect
function SidebarNavItem({ 
  item, 
  collapsed 
}: { 
  item: { title: string; url: string; icon: typeof LayoutDashboard }; 
  collapsed: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={item.title}>
        <NavLink
          to={item.url}
          className={cn(
            "flex items-center gap-2 sidebar-menu-hover rounded-md",
            "transition-all duration-300"
          )}
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
        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Főmenü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
              
              {/* Hangfelvétel - conditionally active based on Flexi connection */}
              <SidebarMenuItem>
                {isFlexiConnected ? (
                  <SidebarMenuButton asChild tooltip="Hangfelvétel">
                    <NavLink
                      to="/voice-recording"
                      className="flex items-center gap-2 sidebar-menu-hover rounded-md transition-all duration-300"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <Mic className="h-4 w-4 shrink-0" />
                      <span className={cn(
                        "transition-opacity duration-200",
                        collapsed ? "opacity-0 w-0" : "opacity-100"
                      )}>Hangfelvétel</span>
                    </NavLink>
                  </SidebarMenuButton>
                ) : (
                  <HoverCard openDelay={0} closeDelay={200}>
                    <HoverCardTrigger asChild>
                      <div className="flex items-center gap-2 opacity-50 cursor-not-allowed px-2 py-1.5 text-sm w-full sidebar-menu-hover rounded-md">
                        <Mic className="h-4 w-4 shrink-0" />
                        <span className={cn(
                          "transition-opacity duration-200",
                          collapsed ? "opacity-0 w-0" : "opacity-100"
                        )}>Hangfelvétel</span>
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
                        Jelenleg nincs hozzácsatolva FlexiDent fiók -{' '}
                        <button
                          onClick={handleFlexiLinkClick}
                          className="underline text-primary hover:text-primary/80 font-medium"
                        >
                          kérem csatolja hozzá fiókját itt!
                        </button>
                      </p>
                    </HoverCardContent>
                  </HoverCard>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Egyéb</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNavItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className={cn(
              "transition-all duration-200",
              collapsed ? "opacity-0" : "opacity-100"
            )}>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Admin Panel">
                    <NavLink
                      to="/admin"
                      className="flex items-center gap-2 sidebar-menu-hover rounded-md transition-all duration-300"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <Shield className="h-4 w-4 shrink-0" />
                      <span className={cn(
                        "transition-opacity duration-200",
                        collapsed ? "opacity-0 w-0" : "opacity-100"
                      )}>Admin Panel</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(isKlinikaAdmin || isAdmin) && (
          <SidebarGroup>
            <SidebarGroupLabel className={cn(
              "transition-all duration-200",
              collapsed ? "opacity-0" : "opacity-100"
            )}>Klinika</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Klinika Admin">
                    <NavLink
                      to="/klinika-admin"
                      className="flex items-center gap-2 sidebar-menu-hover rounded-md transition-all duration-300"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className={cn(
                        "transition-opacity duration-200",
                        collapsed ? "opacity-0 w-0" : "opacity-100"
                      )}>Klinika Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className={cn(
            "transition-all duration-200",
            collapsed ? "opacity-0" : "opacity-100"
          )}>Fiók</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {userNavItems.map((item) => (
                <SidebarNavItem key={item.title} item={item} collapsed={collapsed} />
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
                      {isAdmin ? 'Admin' : isKlinikaAdmin ? 'Klinika Admin' : 'Felhasználó'}
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
