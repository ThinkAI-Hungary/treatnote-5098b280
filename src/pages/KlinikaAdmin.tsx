import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Building2, Users, Plus, UserPlus, Trash2, Loader2, Eye, EyeOff, Shield, Mail, X, Sparkles, Star
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useKlinikaAdminRole } from '@/hooks/useKlinikaAdminRole';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface KlinikaUser {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  telephely_name: string | null;
  subscription_status: string;
  role: string;
}

interface AvailableUser {
  id: string;
  email: string;
  full_name: string | null;
  has_company: boolean;
  is_local_user: boolean;
}

interface SentInvitation {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

// Star field component for background effect
const StarField = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 3,
      size: Math.random() * 2 + 1,
    }));
  }, []);

  return (
    <div className="star-field">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

// Animated card wrapper
const AnimatedCard = ({ 
  children, 
  className, 
  delay = 0,
  ...props 
}: { 
  children: React.ReactNode; 
  className?: string; 
  delay?: number;
  [key: string]: any;
}) => (
  <Card 
    className={cn(
      "animate-fade-in-up hover-lift border-primary/20 bg-card/80 backdrop-blur-sm",
      "dark:bg-card/60 dark:border-sparkle-blue/20",
      "transition-all duration-300",
      className
    )} 
    style={{ animationDelay: `${delay}ms` }}
    {...props}
  >
    {children}
  </Card>
);

// Galaxy button variant
const GalaxyButton = ({ 
  children, 
  className, 
  variant = 'default',
  ...props 
}: { 
  children: React.ReactNode; 
  className?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  [key: string]: any;
}) => (
  <Button
    className={cn(
      "relative overflow-hidden transition-all duration-300",
      variant === 'default' && [
        "bg-gradient-to-r from-primary to-accent text-primary-foreground",
        "hover:shadow-lg hover:shadow-primary/25",
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-accent before:to-primary",
        "before:opacity-0 before:transition-opacity before:duration-300",
        "hover:before:opacity-100",
        "[&>*]:relative [&>*]:z-10"
      ],
      className
    )}
    variant={variant}
    {...props}
  >
    {children}
  </Button>
);

export default function KlinikaAdmin() {
  const { isKlinikaAdmin, companyName, telephelyName, loading: roleLoading } = useKlinikaAdminRole();
  const { isAdmin, loading: adminRoleLoading } = useUserRole();
  const [users, setUsers] = useState<KlinikaUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Create user state
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Invite user state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

  // Sent invitations state
  const [sentInvitations, setSentInvitations] = useState<SentInvitation[]>([]);
  const [loadingSentInvitations, setLoadingSentInvitations] = useState(false);
  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null);

  useEffect(() => {
    if (isKlinikaAdmin || isAdmin) {
      loadUsers();
      loadSentInvitations();
    }
  }, [isKlinikaAdmin, isAdmin]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'get-users' },
      });

      if (error) throw error;
      setUsers(data.users || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Hiba a felhasználók betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    setLoadingAvailable(true);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'get-available-users' },
      });

      if (error) throw error;
      setAvailableUsers(data.users || []);
    } catch (error: any) {
      console.error('Error loading available users:', error);
      toast.error('Hiba a meghívható felhasználók betöltésekor');
    } finally {
      setLoadingAvailable(false);
    }
  };

  const loadSentInvitations = async () => {
    setLoadingSentInvitations(true);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'get-sent-invitations' },
      });

      if (error) throw error;
      setSentInvitations(data.invitations || []);
    } catch (error: any) {
      console.error('Error loading sent invitations:', error);
    } finally {
      setLoadingSentInvitations(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    setCancellingInvitationId(invitationId);
    try {
      const { error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'cancel-invitation', invitationId },
      });

      if (error) throw error;

      toast.success('Meghívó visszavonva');
      loadSentInvitations();
      loadAvailableUsers();
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      toast.error(error.message || 'Hiba a meghívó visszavonásakor');
    } finally {
      setCancellingInvitationId(null);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast.error('Kérjük töltse ki az email/felhasználónév és jelszó mezőket');
      return;
    }

    if (newUserPassword !== newUserConfirmPassword) {
      toast.error('A jelszavak nem egyeznek');
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error('A jelszónak legalább 6 karakter hosszúnak kell lennie');
      return;
    }

    const finalEmail = newUserEmail.includes('@') 
      ? newUserEmail 
      : `${newUserEmail}@localuser.com`;

    setCreatingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { 
          operation: 'create-user',
          email: finalEmail, 
          password: newUserPassword,
          fullName: newUserFullName,
        },
      });

      if (error) throw error;

      toast.success('Felhasználó sikeresen létrehozva');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserConfirmPassword('');
      setNewUserFullName('');
      setCreateUserOpen(false);
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Hiba a felhasználó létrehozásakor');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleInviteUser = async (userId: string, isLocalUser: boolean) => {
    setInvitingUserId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'invite-user', userId },
      });

      if (error) {
        let message = error.message;
        const body = (error as any)?.context?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) message = parsed.error;
          } catch {
            // ignore JSON parse errors
          }
        }
        toast.error(message);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data.type === 'direct') {
        toast.success('Felhasználó sikeresen hozzáadva az organizációhoz');
      } else {
        toast.success('Meghívó elküldve! A felhasználónak el kell fogadnia a meghívást.');
      }
      loadUsers();
      loadAvailableUsers();
      loadSentInvitations();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast.error(error?.message || 'Hiba a felhasználó meghívásakor');
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      const { error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'remove-user', userId },
      });

      if (error) throw error;

      toast.success('Felhasználó eltávolítva az organizációból');
      loadUsers();
      loadSentInvitations();
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error(error.message || 'Hiba a felhasználó eltávolításakor');
    }
  };

  const openInviteDialog = () => {
    setInviteDialogOpen(true);
    loadAvailableUsers();
  };

  if (roleLoading || adminRoleLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="relative">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="absolute inset-0 animate-pulse-glow rounded-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!isKlinikaAdmin && !isAdmin) {
    return (
      <Layout>
        <div className="relative min-h-[60vh]">
          <StarField />
          <AnimatedCard className="relative z-10 max-w-md mx-auto mt-20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="relative mb-6">
                <Shield className="h-16 w-16 text-destructive/70" />
                <div className="absolute inset-0 animate-pulse-glow rounded-full" />
              </div>
              <h3 className="text-xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Hozzáférés megtagadva
              </h3>
              <p className="text-muted-foreground text-center max-w-sm mt-2">
                Ez az oldal csak Klinika Adminok számára érhető el.
              </p>
            </CardContent>
          </AnimatedCard>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="relative min-h-screen">
        {/* Star field background */}
        <StarField />
        
        {/* Nebula overlay effect */}
        <div className="absolute inset-0 pointer-events-none nebula-overlay" />
        
        <div className="relative z-10 space-y-8 pb-8">
          {/* Header section with galaxy gradient */}
          <div className="animate-fade-in-down">
            <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
              {/* Sparkle decoration */}
              <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-float" />
              <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-float" style={{ animationDelay: '1s' }} />
              
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-purple">
                    <Building2 className="h-7 w-7 text-primary-foreground" />
                  </div>
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                    {companyName && telephelyName ? `${companyName} - ${telephelyName}` : 'Organizáció kezelése'}
                  </h1>
                  <p className="text-muted-foreground mt-1 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Organizáció kezelése
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs with enhanced styling */}
          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="animate-fade-in bg-card/80 backdrop-blur-sm border border-primary/20 dark:border-sparkle-blue/20 p-1">
              <TabsTrigger 
                value="users" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-300"
              >
                <Users className="h-4 w-4" />
                Tagok
              </TabsTrigger>
              <TabsTrigger 
                value="invite" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary transition-all duration-300"
              >
                <UserPlus className="h-4 w-4" />
                Meghívás
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gradient-to-r from-primary to-accent" />
                  Szervezeti tagok
                </h2>
                <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
                  <DialogTrigger asChild>
                    <GalaxyButton>
                      <Plus className="mr-2 h-4 w-4" />
                      Új felhasználó
                    </GalaxyButton>
                  </DialogTrigger>
                  <DialogContent className="border-primary/20 dark:border-sparkle-blue/20 bg-card/95 backdrop-blur-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Új felhasználó létrehozása
                      </DialogTitle>
                      <DialogDescription>
                        Az új felhasználó automatikusan az organizációhoz kerül: {companyName} - {telephelyName}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Email / Felhasználónév</Label>
                        <Input
                          type="text"
                          placeholder="email@example.com vagy felhasználónév"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          className="border-primary/20 focus:border-primary/40 transition-colors duration-200"
                        />
                        <p className="text-xs text-muted-foreground">
                          Ha nem tartalmaz @ jelet, automatikusan @localuser.com végződést kap
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Teljes név</Label>
                        <Input
                          placeholder="Teljes név"
                          value={newUserFullName}
                          onChange={(e) => setNewUserFullName(e.target.value)}
                          className="border-primary/20 focus:border-primary/40 transition-colors duration-200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Jelszó</Label>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Jelszó"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            className="border-primary/20 focus:border-primary/40 transition-colors duration-200 pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Jelszó megerősítése</Label>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Jelszó megerősítése"
                          value={newUserConfirmPassword}
                          onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                          className="border-primary/20 focus:border-primary/40 transition-colors duration-200"
                        />
                        {newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
                          <p className="text-xs text-destructive animate-fade-in">A jelszavak nem egyeznek</p>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setCreateUserOpen(false);
                          setNewUserEmail('');
                          setNewUserPassword('');
                          setNewUserConfirmPassword('');
                          setNewUserFullName('');
                        }}
                        className="border-primary/20 hover:bg-primary/10 transition-all duration-200"
                      >
                        Mégse
                      </Button>
                      <GalaxyButton 
                        onClick={handleCreateUser} 
                        disabled={creatingUser || (newUserConfirmPassword !== '' && newUserPassword !== newUserConfirmPassword)}
                      >
                        {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Létrehozás
                      </GalaxyButton>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="relative">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="absolute inset-0 animate-pulse-glow rounded-full" />
                  </div>
                </div>
              ) : users.length === 0 ? (
                <AnimatedCard>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="relative mb-4">
                      <Users className="h-16 w-16 text-muted-foreground/30" />
                      <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent/50 animate-float" />
                    </div>
                    <p className="text-muted-foreground">Még nincsenek tagok</p>
                  </CardContent>
                </AnimatedCard>
              ) : (
                <AnimatedCard className="overflow-hidden">
                  <div className="rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
                          <TableHead className="font-semibold">Email</TableHead>
                          <TableHead className="font-semibold">Név</TableHead>
                          <TableHead className="font-semibold">Státusz</TableHead>
                          <TableHead className="font-semibold">Szerep</TableHead>
                          <TableHead className="text-right font-semibold">Műveletek</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user, index) => (
                          <TableRow 
                            key={user.id}
                            className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-300 animate-fade-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.full_name || '-'}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={user.subscription_status === 'active' ? 'default' : 'secondary'}
                                className={cn(
                                  "transition-all duration-200",
                                  user.subscription_status === 'active' && "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                                )}
                              >
                                {user.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={cn(
                                  "transition-all duration-200",
                                  user.role === 'admin' && 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700',
                                  user.role === 'klinika_admin' && 'bg-gradient-to-r from-primary to-accent text-white hover:opacity-90',
                                  user.role !== 'admin' && user.role !== 'klinika_admin' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                )}
                              >
                                {user.role === 'admin' ? 'Admin' : user.role === 'klinika_admin' ? 'Klinika Admin' : 'Felhasználó'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {user.role !== 'klinika_admin' && user.role !== 'admin' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                  onClick={() => handleRemoveUser(user.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AnimatedCard>
              )}
            </TabsContent>

            <TabsContent value="invite" className="space-y-6 animate-fade-in">
              <AnimatedCard>
                <CardHeader className="border-b border-primary/10">
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                      <UserPlus className="h-5 w-5 text-primary-foreground" />
                    </div>
                    Felhasználók meghívása
                  </CardTitle>
                  <CardDescription>
                    Meglévő felhasználók meghívása az organizációba: {companyName} - {telephelyName}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <GalaxyButton onClick={openInviteDialog}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Felhasználók böngészése
                  </GalaxyButton>
                </CardContent>
              </AnimatedCard>

              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogContent className="max-w-2xl border-primary/20 dark:border-sparkle-blue/20 bg-card/95 backdrop-blur-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-accent" />
                      Felhasználók meghívása
                    </DialogTitle>
                    <DialogDescription>
                      Válasszon felhasználókat az organizációba való meghíváshoz
                    </DialogDescription>
                  </DialogHeader>
                  {loadingAvailable ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="relative">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <div className="absolute inset-0 animate-pulse-glow rounded-full" />
                      </div>
                    </div>
                  ) : availableUsers.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      Nincs meghívható felhasználó
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {availableUsers.map((user, index) => (
                          <div
                            key={user.id}
                            className="group flex items-center justify-between p-4 border border-primary/10 rounded-xl bg-card/50 hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-300 animate-fade-in"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                                <span className="text-sm font-medium text-primary">
                                  {user.email.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium">{user.email}</div>
                                {user.full_name && (
                                  <div className="text-sm text-muted-foreground">{user.full_name}</div>
                                )}
                                {user.has_company && (
                                  <Badge variant="outline" className="mt-1 text-xs border-accent/30 text-accent">
                                    Másik organizációban
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <GalaxyButton
                              size="sm"
                              onClick={() => handleInviteUser(user.id, user.is_local_user)}
                              disabled={invitingUserId === user.id}
                            >
                              {invitingUserId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  {user.is_local_user ? 'Hozzáadás' : 'Meghívás'}
                                </>
                              )}
                            </GalaxyButton>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </DialogContent>
              </Dialog>

              {/* Sent Invitations List */}
              <AnimatedCard delay={100}>
                <CardHeader className="border-b border-primary/10">
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-primary flex items-center justify-center">
                      <Mail className="h-5 w-5 text-primary-foreground" />
                    </div>
                    Elküldött meghívók
                  </CardTitle>
                  <CardDescription>
                    Az Ön által elküldött meghívók listája
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {loadingSentInvitations ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="relative">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <div className="absolute inset-0 animate-pulse-glow rounded-full" />
                      </div>
                    </div>
                  ) : sentInvitations.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      Nincs elküldött meghívó
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden border border-primary/10">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
                            <TableHead className="font-semibold">Email</TableHead>
                            <TableHead className="font-semibold">Név</TableHead>
                            <TableHead className="font-semibold">Státusz</TableHead>
                            <TableHead className="font-semibold">Elküldve</TableHead>
                            <TableHead className="text-right font-semibold">Műveletek</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sentInvitations.map((invitation, index) => (
                            <TableRow 
                              key={invitation.id}
                              className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5 transition-all duration-300 animate-fade-in"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <TableCell className="font-medium">{invitation.email}</TableCell>
                              <TableCell>{invitation.full_name || '-'}</TableCell>
                              <TableCell>
                                <Badge 
                                  className={cn(
                                    "transition-all duration-200",
                                    invitation.status === 'pending' && 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
                                    invitation.status === 'accepted' && 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white',
                                    invitation.status === 'rejected' && 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                                  )}
                                >
                                  {invitation.status === 'pending' ? 'Függőben' : 
                                   invitation.status === 'accepted' ? 'Elfogadva' : 
                                   'Elutasítva'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {format(new Date(invitation.created_at), 'yyyy. MMM d.', { locale: hu })}
                              </TableCell>
                              <TableCell className="text-right">
                                {invitation.status === 'pending' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100"
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    disabled={cancellingInvitationId === invitation.id}
                                  >
                                    {cancellingInvitationId === invitation.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <X className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </AnimatedCard>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
