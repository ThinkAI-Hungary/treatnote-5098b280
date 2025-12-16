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
  Building2, Users, Plus, UserPlus, Trash2, Loader2, Eye, EyeOff, Shield, Mail, X
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useKlinikaAdminRole } from '@/hooks/useKlinikaAdminRole';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

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
        // supabase-js returns a FunctionsHttpError for non-2xx responses (e.g. 409)
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
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  // Allow access for both klinika_admin and admin roles
  if (!isKlinikaAdmin && !isAdmin) {
    return (
      <Layout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-destructive/50 mb-4" />
            <h3 className="text-lg font-medium">Hozzáférés megtagadva</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-1">
              Ez az oldal csak Klinika Adminok számára érhető el.
            </p>
          </CardContent>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {companyName && telephelyName ? `${companyName} - ${telephelyName}` : 'Organizáció kezelése'}
          </h1>
          <p className="text-muted-foreground mt-1">Organizáció kezelése</p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Tagok
            </TabsTrigger>
            <TabsTrigger value="invite" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Meghívás
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Organizáció kezelése</h2>
              <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Új felhasználó
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Új felhasználó létrehozása</DialogTitle>
                    <DialogDescription>
                      Az új felhasználó automatikusan az organizációhoz kerül: {companyName} - {telephelyName}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Email / Felhasználónév</Label>
                      <Input
                        type="text"
                        placeholder="email@example.com vagy felhasználónév"
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Ha nem tartalmaz @ jelet, automatikusan @localuser.com végződést kap
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Teljes név</Label>
                      <Input
                        placeholder="Teljes név"
                        value={newUserFullName}
                        onChange={(e) => setNewUserFullName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Jelszó</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Jelszó"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Jelszó megerősítése</Label>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Jelszó megerősítése"
                        value={newUserConfirmPassword}
                        onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                      />
                      {newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
                        <p className="text-xs text-destructive">A jelszavak nem egyeznek</p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setCreateUserOpen(false);
                      setNewUserEmail('');
                      setNewUserPassword('');
                      setNewUserConfirmPassword('');
                      setNewUserFullName('');
                    }}>
                      Mégse
                    </Button>
                    <Button 
                      onClick={handleCreateUser} 
                      disabled={creatingUser || (newUserConfirmPassword !== '' && newUserPassword !== newUserConfirmPassword)}
                    >
                      {creatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Létrehozás
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Még nincsenek tagok</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Név</TableHead>
                      <TableHead>Státusz</TableHead>
                      <TableHead>Szerep</TableHead>
                      <TableHead className="text-right">Műveletek</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>{user.full_name || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={user.subscription_status === 'active' ? 'default' : 'secondary'}>
                            {user.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={
                              user.role === 'admin' 
                                ? 'bg-red-500 text-white hover:bg-red-600' 
                                : user.role === 'klinika_admin' 
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }
                          >
                            {user.role === 'admin' ? 'Admin' : user.role === 'klinika_admin' ? 'Klinika Admin' : 'Felhasználó'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {user.role !== 'klinika_admin' && user.role !== 'admin' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
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
            )}
          </TabsContent>

          <TabsContent value="invite" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Felhasználók meghívása
                </CardTitle>
                <CardDescription>
                  Meglévő felhasználók meghívása az organizációba: {companyName} - {telephelyName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={openInviteDialog}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Felhasználók böngészése
                </Button>
              </CardContent>
            </Card>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Felhasználók meghívása</DialogTitle>
                  <DialogDescription>
                    Válasszon felhasználókat az organizációba való meghíváshoz
                  </DialogDescription>
                </DialogHeader>
                {loadingAvailable ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nincs meghívható felhasználó
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {availableUsers.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <div className="font-medium">{user.email}</div>
                            {user.full_name && (
                              <div className="text-sm text-muted-foreground">{user.full_name}</div>
                            )}
                            {user.has_company && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                Másik organizációban
                              </Badge>
                            )}
                          </div>
                          <Button
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
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </DialogContent>
            </Dialog>

            {/* Sent Invitations List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Elküldött meghívók
                </CardTitle>
                <CardDescription>
                  Az Ön által elküldött meghívók listája
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSentInvitations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : sentInvitations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nincs elküldött meghívó
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Név</TableHead>
                          <TableHead>Státusz</TableHead>
                          <TableHead>Elküldve</TableHead>
                          <TableHead className="text-right">Műveletek</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sentInvitations.map((invitation) => (
                          <TableRow key={invitation.id}>
                            <TableCell className="font-medium">{invitation.email}</TableCell>
                            <TableCell>{invitation.full_name || '-'}</TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  invitation.status === 'pending' ? 'secondary' : 
                                  invitation.status === 'accepted' ? 'default' : 
                                  'destructive'
                                }
                              >
                                {invitation.status === 'pending' ? 'Függőben' : 
                                 invitation.status === 'accepted' ? 'Elfogadva' : 
                                 'Elutasítva'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {format(new Date(invitation.created_at), 'yyyy. MMM d.', { locale: hu })}
                            </TableCell>
                            <TableCell className="text-right">
                              {invitation.status === 'pending' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
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
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
