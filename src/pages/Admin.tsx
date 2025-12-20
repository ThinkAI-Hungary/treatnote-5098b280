import { PageLoader } from '@/components/PageLoader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { 
  Shield, Users, FolderTree, Plus, 
  AlertTriangle, 
  Building2, Eye, EyeOff, Loader2, Sparkles, Star, RefreshCw
} from 'lucide-react';
import { FileManager } from '@/components/admin/FileManager';
import { UsersTable } from '@/components/admin/UsersTable';
import { CompanyManagement } from '@/components/admin/CompanyManagement';
import { StarField } from '@/components/klinika/StarField';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabaseHelpers';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sanitizePathName } from '@/lib/hungarianNormalizer';
import { USERS_DATA_CHANGED } from '@/lib/userSyncEvents';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  company_id: string | null;
  telephely_id: string | null;
  telephely_name: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  subscription_end_date: string | null;
  role: string;
  can_create_users: boolean;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Telephely {
  id: string;
  name: string;
  company_id: string;
}

interface FolderStructure {
  id: string;
  folder_path: string;
  parent_path: string | null;
  is_client_folder: boolean;
  created_at: string;
  created_by: string;
}

export default function Admin() {
  const { isAdmin, loading: roleLoading } = useCachedRoles();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [telephelyek, setTelephelyek] = useState<Telephely[]>([]);
  const [folders, setFolders] = useState<FolderStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');

  // User creation state
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserTelephely, setNewUserTelephely] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'admin' | 'klinika_admin'>('user');
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // User edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editCompanyId, setEditCompanyId] = useState<string>('');
  const [editTelephelyId, setEditTelephelyId] = useState<string>('');
  const [editRole, setEditRole] = useState<'user' | 'admin' | 'klinika_admin'>('user');
  const [editCanCreateUsers, setEditCanCreateUsers] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Re-auth state
  const [reAuthDialogOpen, setReAuthDialogOpen] = useState(false);
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [reAuthAction, setReAuthAction] = useState<'promote' | 'delete-user' | 'delete-folder' | null>(null);
  const [reAuthenticating, setReAuthenticating] = useState(false);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);

  // Folder access state
  const [userFolderAccess, setUserFolderAccess] = useState<Record<string, string[]>>({});
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isAdmin) {
      loadAllData();
      setupRealtimeSubscriptions();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    const handleUsersChanged = () => {
      loadUsersWithRoles();
      loadAllUserFolderAccess();
    };

    window.addEventListener(USERS_DATA_CHANGED, handleUsersChanged);
    return () => window.removeEventListener(USERS_DATA_CHANGED, handleUsersChanged);
  }, [isAdmin]);

  const setupRealtimeSubscriptions = () => {
    const channel = supabase
      .channel('admin-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadUsersWithRoles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => loadUsersWithRoles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => loadUsersWithRoles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'telephely' }, () => loadUsersWithRoles())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_structure' }, () => loadFolders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'folder_access' }, () => loadAllUserFolderAccess())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadAllData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    await Promise.all([
      loadUsersWithRoles(),
      loadFolders(),
      loadAllUserFolderAccess(),
    ]);
    if (showLoader) setLoading(false);
  };

  // Refresh only companies/telephelyek data without full reload
  const refreshCompanyData = async () => {
    await loadUsersWithRoles();
  };

  const loadUsersWithRoles = async () => {
    try {
      const { data, error } = await invokeWithRetry<{
        users: any[];
        companies: Company[];
        telephelyek: Telephely[];
      }>('get-all-users');

      if (error) {
        throw new Error(error.message);
      }

      const mappedUsers = (data?.users || []).map((u: any) => ({
        ...u,
        id: u.user_id,
      }));

      setUsers(mappedUsers);
      setCompanies(data?.companies || []);
      setTelephelyek(data?.telephelyek || []);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Hiba a felhasználók betöltésekor');
    }
  };

  const loadFolders = async () => {
    const { data } = await supabase
      .from('folder_structure')
      .select('*')
      .order('folder_path');
    
    setFolders(data || []);
  };

  const loadAllUserFolderAccess = async () => {
    const { data } = await supabase
      .from('folder_access')
      .select('user_id, folder_id');

    if (data) {
      const accessMap: Record<string, string[]> = {};
      data.forEach(access => {
        if (!accessMap[access.user_id]) {
          accessMap[access.user_id] = [];
        }
        accessMap[access.user_id].push(access.folder_id);
      });
      setUserFolderAccess(accessMap);
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
      const { data, error } = await invokeWithRetry('create-user', { 
        email: finalEmail, 
        password: newUserPassword,
        fullName: newUserFullName,
        role: newUserRole,
        telephely: newUserTelephely
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
      } else if ((data as any)?.error) {
        errorMessage = (data as any).error;
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
      setNewUserTelephely('');
      setNewUserRole('user');
      setCreateUserOpen(false);
      loadUsersWithRoles();
    } catch (error: any) {
      console.error('Error creating user:', error);
      const message = error?.message || '';
      if (message.toLowerCase().includes('already') && message.toLowerCase().includes('registered')) {
        toast.error('Ez az email cím vagy felhasználónév már regisztrálva van');
      } else {
        toast.error(message || 'Hiba a felhasználó létrehozásakor');
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const openEditDialog = (userWithRole: AdminUser) => {
    setEditingUser(userWithRole);
    setEditCompanyId(userWithRole.company_id || '');
    setEditTelephelyId(userWithRole.telephely_id || '');
    setEditCanCreateUsers(userWithRole.can_create_users || false);
    setEditRole(userWithRole.role as 'user' | 'admin' | 'klinika_admin');
    setEditDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    const isPromotingToAdmin = editRole === 'admin' && editingUser.role !== 'admin';
    if (isPromotingToAdmin) {
      setReAuthAction('promote');
      setReAuthDialogOpen(true);
      return;
    }

    await performUserSave();
  };

  const performUserSave = async () => {
    if (!editingUser) return;
    setSavingUser(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        company_id: editCompanyId || null,
        telephely_id: editTelephelyId || null,
        can_create_users: editCanCreateUsers,
      })
      .eq('user_id', editingUser.id);

    if (error) {
      toast.error('Hiba a felhasználó mentésekor');
      setSavingUser(false);
      return;
    }

    const currentRole = editingUser.role;
    if (editRole !== currentRole) {
      await supabase.from('user_roles').delete().eq('user_id', editingUser.id);
      
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: editingUser.id, role: editRole });
      
      if (roleError) {
        console.error('Error updating role:', roleError);
        toast.error('Hiba a szerepkör frissítésekor');
      }
    }

    if (editCompanyId && editTelephelyId) {
      const company = companies.find(c => c.id === editCompanyId);
      const telephely = telephelyek.find(t => t.id === editTelephelyId);
      const userName = editingUser.full_name || editingUser.email.split('@')[0];
      
      if (company && telephely) {
        try {
          const sanitizedCompany = sanitizePathName(company.name);
          const sanitizedTelephely = sanitizePathName(telephely.name);
          const sanitizedUser = sanitizePathName(userName);
          
          const folderPath = `TreatNote/Companies/${sanitizedCompany}/${sanitizedTelephely}/${sanitizedUser}`;
          
          await invokeWithRetry('admin-file-manager', { operation: 'create-folder', path: folderPath });
          
          console.log(`Created folder: ${folderPath}`);
        } catch (folderError) {
          console.error('Error creating user folder:', folderError);
        }
      }
    }

    toast.success('Felhasználó sikeresen frissítve');
    setEditDialogOpen(false);
    setEditingUser(null);
    setSavingUser(false);
    loadUsersWithRoles();
  };

  const handleDeleteUser = (userId: string) => {
    setPendingDeleteUserId(userId);
    setReAuthAction('delete-user');
    setReAuthDialogOpen(true);
  };

  const performUserDelete = async (userId: string) => {
    const { data, error } = await invokeWithRetry<{ message: string }>('delete-user', { userId });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(data.message || 'Felhasználó törölve');
    loadUsersWithRoles();
  };

  const handleReAuthenticate = async () => {
    if (!user?.email || !reAuthPassword) return;
    
    setReAuthenticating(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: reAuthPassword,
    });

    if (error) {
      toast.error('Hibás jelszó. Kijelentkeztetés...');
      setReAuthenticating(false);
      setReAuthDialogOpen(false);
      setReAuthPassword('');
      setPendingDeleteUserId(null);
      
      await supabase.auth.signOut();
      return;
    }

    setReAuthDialogOpen(false);
    setReAuthPassword('');
    setReAuthenticating(false);

    if (reAuthAction === 'promote') {
      await performUserSave();
    } else if (reAuthAction === 'delete-user' && pendingDeleteUserId) {
      await performUserDelete(pendingDeleteUserId);
      setPendingDeleteUserId(null);
    }
  };

  const toggleUser = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleToggleFolderAccess = async (userId: string, folderId: string, hasAccess: boolean) => {
    if (hasAccess) {
      const { error } = await supabase
        .from('folder_access')
        .delete()
        .eq('user_id', userId)
        .eq('folder_id', folderId);

      if (error) {
        toast.error('Hiba a hozzáférés eltávolításakor');
        return;
      }
    } else {
      const { error } = await supabase
        .from('folder_access')
        .insert({
          user_id: userId,
          folder_id: folderId,
          granted_by: user?.id,
        });

      if (error) {
        toast.error('Hiba a hozzáférés megadásakor');
        return;
      }
    }

    loadAllUserFolderAccess();
  };

  // Single loading gate
  if (roleLoading || loading) {
    return <PageLoader />;
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-destructive/50 mb-4" />
          <h3 className="text-lg font-medium">Hozzáférés megtagadva</h3>
          <p className="text-muted-foreground text-center max-w-sm mt-1">
            Ez az oldal csak adminisztrátorok számára érhető el.
          </p>
        </CardContent>
      </Card>
    );
  }

  const filteredTelephelyek = editCompanyId 
    ? telephelyek.filter(t => t.company_id === editCompanyId)
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background layer */}
      <div className="fixed inset-0 z-0">
        <div className="animate-fade-in" style={{ animationDuration: '300ms' }}>
          <StarField />
          <div className="absolute inset-0 pointer-events-none nebula-overlay" />
        </div>
      </div>

      {/* Content layer */}
      <div 
        className="relative z-10 space-y-8 pb-8 animate-fade-in-up p-6" 
        style={{ animationDuration: '400ms', animationDelay: '100ms', animationFillMode: 'both' }}
      >
        {/* Header */}
        <div className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
          <Sparkles className="absolute top-4 right-4 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
          <Star className="absolute bottom-4 right-12 h-4 w-4 text-primary/40 animate-float" style={{ animationDelay: '1s', willChange: 'transform' }} />
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-purple">
                <Shield className="h-7 w-7 text-primary-foreground" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Admin Panel
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Rendszer adminisztráció
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card/80 backdrop-blur-sm border border-primary/20 dark:border-sparkle-blue/20 p-1">
            <TabsTrigger 
              value="users" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary focus:ring-0 focus:outline-none"
            >
              <Users className="h-4 w-4" />
              Felhasználók
            </TabsTrigger>
            <TabsTrigger 
              value="files" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary focus:ring-0 focus:outline-none"
            >
              <FolderTree className="h-4 w-4" />
              Fájlkezelő
            </TabsTrigger>
            <TabsTrigger 
              value="companies" 
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary focus:ring-0 focus:outline-none"
            >
              <Building2 className="h-4 w-4" />
              Cégek és telephelyek
            </TabsTrigger>
          </TabsList>

          {/* Tab content with min-height to prevent layout jumps */}
          <div className="min-h-[400px]">
            <TabsContent value="users" className="space-y-6 mt-0">
              <AnimatedCard>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">
                    Felhasználók kezelése
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadAllData(false)}
                      className="border-primary/20 hover:bg-primary/10"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Frissítés
                    </Button>
                    <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
                      <DialogTrigger asChild>
                        <GalaxyButton>
                          <Plus className="mr-2 h-4 w-4" />
                          Új felhasználó
                        </GalaxyButton>
                      </DialogTrigger>
                    <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
                      <DialogHeader>
                        <DialogTitle>Új felhasználó létrehozása</DialogTitle>
                        <DialogDescription>Adja meg az új felhasználó adatait</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Email / Felhasználónév</Label>
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
                          <Label>Teljes név</Label>
                          <Input
                            placeholder="Teljes név"
                            value={newUserFullName}
                            onChange={(e) => setNewUserFullName(e.target.value)}
                            className="border-primary/20 focus:border-primary/40"
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
                              className="border-primary/20 focus:border-primary/40"
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
                            className="border-primary/20 focus:border-primary/40"
                          />
                          {newUserConfirmPassword && newUserPassword !== newUserConfirmPassword && (
                            <p className="text-xs text-destructive">A jelszavak nem egyeznek</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Telephely</Label>
                          <Input
                            placeholder="Telephely neve (pl. Budapest, Szeged)"
                            value={newUserTelephely}
                            onChange={(e) => setNewUserTelephely(e.target.value)}
                            className="border-primary/20 focus:border-primary/40"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Szerepkör</Label>
                          <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as 'user' | 'admin' | 'klinika_admin')}>
                            <SelectTrigger className="border-primary/20">
                              <SelectValue placeholder="Válasszon szerepkört" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">Felhasználó</SelectItem>
                              <SelectItem value="klinika_admin">Klinika Admin</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setCreateUserOpen(false);
                          setNewUserEmail('');
                          setNewUserPassword('');
                          setNewUserConfirmPassword('');
                          setNewUserFullName('');
                          setNewUserTelephely('');
                          setNewUserRole('user');
                        }}>
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
                </div>
                <UsersTable 
                  users={users}
                  companies={companies}
                  telephelyek={telephelyek}
                  onEdit={openEditDialog}
                  onDelete={handleDeleteUser}
                />
              </AnimatedCard>
            </TabsContent>

            <TabsContent value="files" className="space-y-6 mt-0">
              <AnimatedCard>
                <FileManager />
              </AnimatedCard>
            </TabsContent>

            <TabsContent value="companies" className="space-y-6 mt-0">
              <CompanyManagement 
                companies={companies}
                telephelyek={telephelyek}
                onDataChange={refreshCompanyData}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle>Felhasználó szerkesztése</DialogTitle>
              <DialogDescription>{editingUser?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Cég</Label>
                <Select value={editCompanyId || 'none'} onValueChange={(val) => {
                  setEditCompanyId(val === 'none' ? '' : val);
                  setEditTelephelyId('');
                }}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue placeholder="Válasszon céget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nincs cég</SelectItem>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Telephely</Label>
                <Select 
                  value={editTelephelyId || 'none'} 
                  onValueChange={(val) => setEditTelephelyId(val === 'none' ? '' : val)}
                  disabled={!editCompanyId}
                >
                  <SelectTrigger className="border-primary/20">
                    <SelectValue placeholder="Válasszon telephelyet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nincs telephely</SelectItem>
                    {filteredTelephelyek.map((telephely) => (
                      <SelectItem key={telephely.id} value={telephely.id}>
                        {telephely.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Szerepkör</Label>
                <Select value={editRole} onValueChange={(val) => setEditRole(val as 'user' | 'admin' | 'klinika_admin')}>
                  <SelectTrigger className="border-primary/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Felhasználó</SelectItem>
                    <SelectItem value="klinika_admin">Klinika Admin</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Mégse
              </Button>
              <GalaxyButton onClick={handleSaveUser} disabled={savingUser}>
                {savingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Mentés
              </GalaxyButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Re-authentication Dialog */}
        <Dialog open={reAuthDialogOpen} onOpenChange={(open) => {
          if (!open && reAuthenticating) return;
          setReAuthDialogOpen(open);
        }}>
          <DialogContent className="border-primary/20 bg-card/95 backdrop-blur-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Hitelesítés szükséges
              </DialogTitle>
              <DialogDescription>
                {reAuthAction === 'promote' && 'Admin jogosultság megadásához kérjük adja meg a jelszavát.'}
                {reAuthAction === 'delete-user' && 'Felhasználó törléséhez kérjük adja meg a jelszavát.'}
                {reAuthAction === 'delete-folder' && 'Mappa törléséhez kérjük adja meg a jelszavát.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Jelszó</Label>
                <Input
                  type="password"
                  value={reAuthPassword}
                  onChange={(e) => setReAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReAuthenticate()}
                  className="border-primary/20 focus:border-primary/40"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setReAuthDialogOpen(false);
                  setReAuthPassword('');
                  setPendingDeleteUserId(null);
                }}
              >
                Mégse
              </Button>
              <GalaxyButton onClick={handleReAuthenticate} disabled={reAuthenticating || !reAuthPassword}>
                {reAuthenticating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Megerősítés
              </GalaxyButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
