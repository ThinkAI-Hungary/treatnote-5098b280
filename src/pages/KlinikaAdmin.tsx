
import { PageLoader } from '@/components/PageLoader';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Building2, Users, Plus, UserPlus, Trash2, Loader2, Eye, EyeOff, Shield, Mail, Sparkles, Star, FileText, RefreshCw, Pencil
} from 'lucide-react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabaseHelpers';
import { useKlinikaData } from '@/hooks/useKlinikaData';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { OnboardingTour, TourHelpButton, TourStep } from '@/components/klinika/OnboardingTour';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SzabalyokTab } from '@/components/klinika/SzabalyokTab';
import { StarField } from '@/components/klinika/StarField';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';

interface AvailableUser {
  id: string;
  email: string;
  full_name: string | null;
  has_company: boolean;
  is_local_user: boolean;
}

export default function KlinikaAdmin() {
  // Single unified data hook - no cascading loading states
  const { 
    isAdmin, 
    isKlinikaAdmin, 
    companyId, 
    companyName, 
    telephelyId, 
    telephelyName, 
    users, 
    sentInvitations, 
    isLoading,
    refreshUsers,
    refreshInvitations,
  } = useKlinikaData();

  // Controlled tab state for tour navigation
  const [activeTab, setActiveTab] = useState('users');

  // Base steps: always start with Welcome + Navigation
  const baseSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="header"]',
      title: 'Üdvözöljük a Klinika Admin felületen!',
      content: 'Itt kezelheti a szervezetét, a tagokat és a szabályokat. Ez az útmutató bemutatja a főbb funkciókat.',
      position: 'bottom',
    },
    {
      target: '[data-tour="tabs"]',
      title: 'Navigációs fülek',
      content: 'Két fő terület van: a "Tagok" fül a felhasználók kezelésére, és a "Szabályok" fül a kezelési szabályok feltöltésére.',
      position: 'bottom',
    },
  ], []);

  // Tagok-only steps (exclude header + tabs)
  const tagokSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="new-user-button"]',
      title: 'Új felhasználó létrehozása',
      content: 'Ezen a gombon keresztül hozhat létre új felhasználókat, akik automatikusan az Ön szervezetéhez kerülnek. Megadhat email címet vagy egyszerű felhasználónevet.',
      position: 'bottom',
    },
    {
      target: '[data-tour="users-table"]',
      title: 'Tagok listája',
      content: 'Itt láthatja a szervezet összes tagját, státuszukat és szerepkörüket.',
      position: 'bottom',
    },
  ], []);

  // Szabályok-only steps
  const szabalyokSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="szabalyok-upload"]',
      title: 'PDF feltöltés',
      content: 'Itt tölthet fel kezelési szabályzatokat PDF formátumban. A rendszer automatikusan feldolgozza és kategorizálja a dokumentumokat.',
      position: 'bottom',
    },
    {
      target: '[data-tour="szabalyok-table"]',
      title: 'Feltöltött szabályzatok',
      content: 'A feltöltött PDF-ek listája itt jelenik meg. Láthatja a feldolgozási státuszt, szerkesztheti a fogalmat, vagy megtekintheti a dokumentumot.',
      position: 'bottom',
    },
    {
      target: '[data-tour="szabalyok-status"]',
      title: 'Feldolgozási státusz',
      content: 'A státusz oszlop mutatja, hogy a PDF feldolgozása folyamatban van, sikeres volt, vagy hiba történt. Hiba esetén újra próbálkozhat.',
      position: 'left',
    },
  ], []);

  // Build tour steps based on current tab - but ALWAYS start with base steps
  const tourSteps: TourStep[] = useMemo(() => {
    if (activeTab === 'szabalyok') {
      // On Szabályok tab: base -> szabályok -> switch to tagok -> tagok
      return [
        ...baseSteps,
        ...szabalyokSteps,
        { ...tagokSteps[0], switchToTab: 'users' },
        ...tagokSteps.slice(1),
      ];
    }

    // On Tagok tab (default): base -> tagok -> switch to szabályok -> szabályok
    return [
      ...baseSteps,
      ...tagokSteps,
      { ...szabalyokSteps[0], switchToTab: 'szabalyok' },
      ...szabalyokSteps.slice(1),
    ];
  }, [activeTab, baseSteps, tagokSteps, szabalyokSteps]);

  const {
    showTour,
    startTour,
    completeTour,
    skipTour,
    isNewUser,
  } = useOnboardingTour({
    tourKey: 'klinika-admin',
    isEligible: isKlinikaAdmin || isAdmin,
    autoShowForNewUsers: true,
    newUserDays: 7,
  });

  // Freeze the tour steps at the moment the tour opens to avoid “glitchy” reordering
  const [tourStepsSnapshot, setTourStepsSnapshot] = useState<TourStep[] | null>(null);

  useEffect(() => {
    if (showTour) {
      // Capture steps only once per open
      setTourStepsSnapshot((prev) => prev ?? tourSteps);
    } else {
      // Clear snapshot when closing
      setTourStepsSnapshot(null);
    }
  }, [showTour, tourSteps]);

  const effectiveTourSteps = showTour ? (tourStepsSnapshot ?? tourSteps) : tourSteps;

  const handleStartTour = useCallback(() => {
    setTourStepsSnapshot(tourSteps);
    startTour();
  }, [startTour, tourSteps]);

  // Email invitation state
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [lastInvitationUrl, setLastInvitationUrl] = useState<string | null>(null);

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

  // Cancelling invitation state
  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null);

  // Edit user name state
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; full_name: string | null } | null>(null);
  const [editUserFullName, setEditUserFullName] = useState('');
  const [updatingUser, setUpdatingUser] = useState(false);

  const handleSendEmailInvitation = useCallback(async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error('Kérjük adjon meg egy érvényes email címet');
      return;
    }

    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke('invitation-handler', {
        body: { operation: 'send-invitation-email', email: inviteEmail.trim() },
      });

      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
        return;
      }

      setLastInvitationUrl(data.invitation_url);
      toast.success(`Meghívó létrehozva: ${inviteEmail}`);
      setInviteEmail('');
      refreshInvitations();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      toast.error(error.message || 'Hiba a meghívó küldésekor');
    } finally {
      setSendingInvite(false);
    }
  }, [inviteEmail, refreshInvitations]);

  const handleCancelInvitation = useCallback(async (invitationId: string) => {
    setCancellingInvitationId(invitationId);
    try {
      const { error } = await invokeWithRetry('klinika-admin', {
        operation: 'cancel-invitation',
        invitationId,
      });
      if (error) throw error;
      toast.success('Meghívó visszavonva');
      refreshInvitations();
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      toast.error(error.message || 'Hiba a meghívó visszavonásakor');
    } finally {
      setCancellingInvitationId(null);
    }
  }, [refreshInvitations]);

  const handleCreateUser = useCallback(async () => {
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

    // Auto-complete email domain using company slug
    const sanitizedCompanyName = companyName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'local';
    const finalEmail = newUserEmail.includes('@') 
      ? newUserEmail 
      : `${newUserEmail}@${sanitizedCompanyName}.com`;

    setCreatingUser(true);
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'create-user',
        email: finalEmail,
        password: newUserPassword,
        fullName: newUserFullName,
      });
      
      // Check for error in the response
      let errorMessage: string | null = null;
      
      if (error) {
        errorMessage = error.message;
        // Try to parse error from context body
        const body = (error as any)?.context?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) errorMessage = parsed.error;
          } catch {}
        }
      } else if (data?.error) {
        errorMessage = data.error;
      }
      
      if (errorMessage) {
        // Check for duplicate email error
        if (errorMessage.toLowerCase().includes('already') && errorMessage.toLowerCase().includes('registered')) {
          toast.error('Ez az email cím vagy felhasználónév már regisztrálva van');
        } else {
          toast.error(errorMessage);
        }
        return;
      }
      
      toast.success('Felhasználó sikeresen létrehozva');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserConfirmPassword('');
      setNewUserFullName('');
      setCreateUserOpen(false);
      refreshUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      // Try to extract error message from various formats
      let errorMessage = error.message || '';
      
      // Check if error has context body (edge function error response)
      const body = error?.context?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error) errorMessage = parsed.error;
        } catch {}
      }
      
      // Check for duplicate email error
      if (errorMessage.toLowerCase().includes('already') && errorMessage.toLowerCase().includes('registered')) {
        toast.error('Ez az email cím már regisztrálva van a rendszerben');
      } else {
        toast.error(errorMessage || 'Hiba a felhasználó létrehozásakor');
      }
    } finally {
      setCreatingUser(false);
    }
  }, [newUserEmail, newUserPassword, newUserConfirmPassword, newUserFullName, refreshUsers]);

  // Keep handleInviteUser for local users (created by admin)
  const handleInviteUser = useCallback(async (userId: string, isLocalUser: boolean) => {
    setInvitingUserId(userId);
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'invite-user',
        userId,
      });

      if (error) {
        let message = error.message;
        const body = (error as any)?.context?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) message = parsed.error;
          } catch {}
        }
        toast.error(message);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Felhasználó sikeresen hozzáadva az organizációhoz');
      refreshUsers();
      refreshInvitations();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast.error(error?.message || 'Hiba a felhasználó meghívásakor');
    } finally {
      setInvitingUserId(null);
    }
  }, [refreshUsers, refreshInvitations]);

  const handleDeleteUser = useCallback(async (userId: string, userEmail: string) => {
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'delete-user-completely',
        email: userEmail,
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success('Felhasználó sikeresen törölve');
      refreshUsers();
      refreshInvitations();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Hiba a felhasználó törlésekor');
    }
  }, [refreshUsers, refreshInvitations]);

  const openEditUser = useCallback((user: { id: string; email: string; full_name: string | null }) => {
    setEditingUser(user);
    setEditUserFullName(user.full_name || '');
    setEditUserOpen(true);
  }, []);

  const handleUpdateUser = useCallback(async () => {
    if (!editingUser) return;

    setUpdatingUser(true);
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'update-user',
        userId: editingUser.id,
        fullName: editUserFullName.trim(),
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Felhasználó neve sikeresen frissítve');
      setEditUserOpen(false);
      setEditingUser(null);
      setEditUserFullName('');
      refreshUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error(error.message || 'Hiba a felhasználó frissítésekor');
    } finally {
      setUpdatingUser(false);
    }
  }, [editingUser, editUserFullName, refreshUsers]);

  const openInviteDialog = useCallback(() => {
    setInviteDialogOpen(true);
    setInviteEmail('');
    setLastInvitationUrl(null);
  }, []);

  // Single loading gate - loader stays until ALL data is ready
  if (isLoading) {
    return <PageLoader />;
  }

  // Access denied view
  if (!isKlinikaAdmin && !isAdmin) {
    return (
      <div className="relative min-h-[60vh] animate-fade-in">
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
    );
  }

  // Main content - cinematic reveal with staggered animation
  return (
    <div className="relative min-h-screen">
        {/* Background layer - fades in first */}
        <div className="animate-fade-in" style={{ animationDuration: '300ms' }}>
          <StarField />
          <div className="absolute inset-0 pointer-events-none nebula-overlay" />
        </div>
        
        {/* Content layer - slides up after background */}
        <div 
          className="relative z-10 space-y-8 pb-8 px-6 pt-6 animate-fade-in-up" 
          style={{ animationDuration: '400ms', animationDelay: '100ms', animationFillMode: 'both' }}
        >
          {/* Header section */}
          <div data-tour="header" className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
            <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
            <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-float" style={{ animationDelay: '1s', willChange: 'transform' }} />
            
            <div className="flex items-center justify-between">
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


          {/* Tabs with min-height to prevent layout jumps - controlled for tour navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList data-tour="tabs" className="bg-card/80 backdrop-blur-sm border border-primary/20 dark:border-sparkle-blue/20 p-1">
              <TabsTrigger 
                value="users" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
              >
                <Users className="h-4 w-4" />
                Tagok
              </TabsTrigger>
              <TabsTrigger 
                value="szabalyok"
                data-tour="szabalyok-tab"
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
              >
                <FileText className="h-4 w-4" />
                Szabályok
              </TabsTrigger>
            </TabsList>

            {/* Tab content with min-height to prevent layout jumps */}
            <div className="min-h-[400px]">
              <TabsContent value="users" className="space-y-6 mt-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Szervezeti tagok
                  </h2>
                  {companyId && telephelyId ? (
                    <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
                      <DialogTrigger asChild>
                        <GalaxyButton data-tour="new-user-button">
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
                            className="border-primary/20 focus:border-primary/40"
                          />
                          <p className="text-xs text-muted-foreground">
                            Ha nem tartalmaz @ jelet, automatikusan @{companyName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'local'}.com végződést kap
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Teljes név</Label>
                          <Input
                            placeholder="Teljes név"
                            value={newUserFullName}
                            onChange={(e) => setNewUserFullName(e.target.value)}
                            className="border-primary/20 focus:border-primary/40"
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
                              className="border-primary/20 focus:border-primary/40 pr-10"
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
                            className="border-primary/20 focus:border-primary/40"
                          />
                          {newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
                            <p className="text-xs text-destructive">A jelszavak nem egyeznek</p>
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
                          className="border-primary/20 hover:bg-primary/10"
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
                  ) : (
                    <div className="text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
                      Cég és telephely hozzárendelése szükséges a felhasználó létrehozáshoz
                    </div>
                  )}
                </div>

                {users.length === 0 ? (
                  <AnimatedCard data-tour="users-table">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="relative mb-4">
                        <Users className="h-16 w-16 text-muted-foreground/30" />
                        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
                      </div>
                      <p className="text-muted-foreground">Még nincsenek tagok</p>
                    </CardContent>
                  </AnimatedCard>
                ) : (
                  <AnimatedCard data-tour="users-table" className="overflow-hidden">
                    <div className="rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
                            <TableHead className="font-semibold">Email</TableHead>
                            <TableHead className="font-semibold">Név</TableHead>
                            <TableHead className="font-semibold">Státusz</TableHead>
                            <TableHead className="font-semibold">Szerep</TableHead>
                            <TableHead className="text-right font-semibold">Műveletek</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow 
                              key={user.id}
                              className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5"
                            >
                              <TableCell className="font-medium">{user.email}</TableCell>
                              <TableCell>{user.full_name || '-'}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant={user.subscription_status === 'active' ? 'default' : 'secondary'}
                                  className={cn(
                                    user.subscription_status === 'active' && "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                                  )}
                                >
                                  {user.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  className={cn(
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
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-primary hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => openEditUser({ id: user.id, email: user.email, full_name: user.full_name })}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleDeleteUser(user.id, user.email)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
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


              <TabsContent value="szabalyok" className="mt-0">
                <SzabalyokTab 
                  companyId={companyId} 
                  telephelyId={telephelyId} 
                  companyName={companyName}
                  telephelyName={telephelyName}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Tour help button - fixed position at bottom right */}
        {!showTour && <TourHelpButton onClick={handleStartTour} />}

        {/* Onboarding Tour */}
        <OnboardingTour
          steps={effectiveTourSteps}
          isOpen={showTour}
          onComplete={completeTour}
          onSkip={skipTour}
          onStepChange={(step) => {
            // Switch to the appropriate tab when a step requires it
            if (step.switchToTab) {
              setActiveTab(step.switchToTab);
            }
          }}
        />

        {/* Edit User Dialog */}
        <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
          <DialogContent className="border-primary/20 dark:border-sparkle-blue/20 bg-card/95 backdrop-blur-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" />
                Felhasználó szerkesztése
              </DialogTitle>
              <DialogDescription>
                {editingUser?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Teljes név</Label>
                <Input
                  placeholder="Teljes név"
                  value={editUserFullName}
                  onChange={(e) => setEditUserFullName(e.target.value)}
                  className="border-primary/20 focus:border-primary/40"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditUserOpen(false);
                  setEditingUser(null);
                  setEditUserFullName('');
                }}
                className="border-primary/20 hover:bg-primary/10"
              >
                Mégse
              </Button>
              <GalaxyButton 
                onClick={handleUpdateUser} 
                disabled={updatingUser}
              >
                {updatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Mentés
              </GalaxyButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
