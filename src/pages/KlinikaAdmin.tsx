
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
  Building2, Users, Plus, UserPlus, Trash2, Loader2, Eye, EyeOff, Shield, Mail, Sparkles, Star, FileText
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useKlinikaData } from '@/hooks/useKlinikaData';
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
      const { error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'cancel-invitation', invitationId },
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
      
      if (error) {
        // Try to extract error message from context body
        let message = error.message;
        const body = (error as any)?.context?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) message = parsed.error;
          } catch {}
        }
        toast.error(message || 'Hiba a felhasználó létrehozásakor');
        return;
      }
      
      if (data?.error) {
        toast.error(data.error);
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
      toast.error(error.message || 'Hiba a felhasználó létrehozásakor');
    } finally {
      setCreatingUser(false);
    }
  }, [newUserEmail, newUserPassword, newUserConfirmPassword, newUserFullName, refreshUsers]);

  // Keep handleInviteUser for local users (created by admin)
  const handleInviteUser = useCallback(async (userId: string, isLocalUser: boolean) => {
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

  const handleRemoveUser = useCallback(async (userId: string) => {
    try {
      const { error } = await supabase.functions.invoke('klinika-admin', {
        body: { operation: 'remove-user', userId },
      });
      if (error) throw error;
      toast.success('Felhasználó eltávolítva az organizációból');
      refreshUsers();
      refreshInvitations();
    } catch (error: any) {
      console.error('Error removing user:', error);
      toast.error(error.message || 'Hiba a felhasználó eltávolításakor');
    }
  }, [refreshUsers, refreshInvitations]);

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
          <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
            <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
            <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-float" style={{ animationDelay: '1s', willChange: 'transform' }} />
            
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

          {/* Tabs with min-height to prevent layout jumps */}
          <Tabs defaultValue="users" className="space-y-6">
            <TabsList className="bg-card/80 backdrop-blur-sm border border-primary/20 dark:border-sparkle-blue/20 p-1">
              <TabsTrigger 
                value="users" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
              >
                <Users className="h-4 w-4" />
                Tagok
              </TabsTrigger>
              <TabsTrigger 
                value="invite" 
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
              >
                <UserPlus className="h-4 w-4" />
                Meghívás
              </TabsTrigger>
              <TabsTrigger 
                value="szabalyok" 
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
                            className="border-primary/20 focus:border-primary/40"
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
                </div>

                {users.length === 0 ? (
                  <AnimatedCard>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="relative mb-4">
                        <Users className="h-16 w-16 text-muted-foreground/30" />
                        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
                      </div>
                      <p className="text-muted-foreground">Még nincsenek tagok</p>
                    </CardContent>
                  </AnimatedCard>
                ) : (
                  <AnimatedCard className="overflow-hidden">
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
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
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

              <TabsContent value="invite" className="space-y-6 mt-0">
                <AnimatedCard>
                  <CardHeader className="border-b border-primary/10">
                    <CardTitle className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <UserPlus className="h-5 w-5 text-primary-foreground" />
                      </div>
                      Felhasználók meghívása
                    </CardTitle>
                    <CardDescription>
                      Küldjön meghívót email címre az organizációba: {companyName} - {telephelyName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex gap-3">
                      <Input
                        type="email"
                        placeholder="email@example.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 border-primary/20 focus:border-primary/40"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendEmailInvitation();
                          }
                        }}
                      />
                      <GalaxyButton onClick={handleSendEmailInvitation} disabled={sendingInvite || !inviteEmail.trim()}>
                        {sendingInvite ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Meghívó küldése
                          </>
                        )}
                      </GalaxyButton>
                    </div>
                    
                    {lastInvitationUrl && (
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          A meghívó link létrehozva. Ossza meg a felhasználóval:
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={lastInvitationUrl}
                            readOnly
                            className="flex-1 text-xs bg-background"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(lastInvitationUrl);
                              toast.success('Link másolva a vágólapra');
                            }}
                          >
                            Másolás
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </AnimatedCard>

                {/* Sent Invitations List */}
                <AnimatedCard>
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
                    {sentInvitations.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Mail className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                        Nincs elküldött meghívó
                      </div>
                    ) : (
                      <div className="rounded-lg overflow-hidden border border-primary/10">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
                              <TableHead className="font-semibold">Email</TableHead>
                              <TableHead className="font-semibold">Név</TableHead>
                              <TableHead className="font-semibold">Státusz</TableHead>
                              <TableHead className="font-semibold">Elküldve</TableHead>
                              <TableHead className="text-right font-semibold">Műveletek</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sentInvitations.map((invitation) => (
                              <TableRow 
                                key={invitation.id}
                                className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5"
                              >
                                <TableCell className="font-medium">{invitation.email}</TableCell>
                                <TableCell>{invitation.full_name || '-'}</TableCell>
                                <TableCell>
                                  <Badge 
                                    className={cn(
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
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => handleCancelInvitation(invitation.id)}
                                      disabled={cancellingInvitationId === invitation.id}
                                    >
                                      {cancellingInvitationId === invitation.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
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
      </div>
  );
}
