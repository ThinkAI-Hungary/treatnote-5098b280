import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Users, FolderTree, Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  subscription_status: string;
  role: string;
}

export default function Admin() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data: session } = await supabase.auth.getSession();
        
        const response = await supabase.functions.invoke('get-all-users');

        if (response.error) {
          throw new Error(response.error.message);
        }

        setUsers(response.data.users || []);
      } catch (error: any) {
        console.error('Error fetching users:', error);
        toast.error('Hiba a felhasználók betöltésekor');
      } finally {
        setLoading(false);
      }
    }

    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  if (roleLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Betöltés...</p>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-destructive/50 mb-4" />
            <h3 className="text-lg font-medium">Hozzáférés megtagadva</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-1">
              Ez az oldal csak adminisztrátorok számára érhető el.
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
          <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground mt-1">
            Rendszer adminisztráció
          </p>
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Felhasználók
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Fájlkezelő
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Felhasználók kezelése</h2>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Új felhasználó
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Betöltés...
              </div>
            ) : (
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-12 px-4 text-left text-sm font-medium">Email</th>
                      <th className="h-12 px-4 text-left text-sm font-medium">Név</th>
                      <th className="h-12 px-4 text-left text-sm font-medium">Cég</th>
                      <th className="h-12 px-4 text-left text-sm font-medium">Státusz</th>
                      <th className="h-12 px-4 text-left text-sm font-medium">Szerep</th>
                      <th className="h-12 px-4 text-right text-sm font-medium">Műveletek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b">
                        <td className="p-4 text-sm">{user.email}</td>
                        <td className="p-4 text-sm">{user.full_name || '-'}</td>
                        <td className="p-4 text-sm">{user.company_name || '-'}</td>
                        <td className="p-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.subscription_status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {user.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
                          </span>
                        </td>
                        <td className="p-4 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role === 'admin' ? 'Admin' : 'Felhasználó'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderTree className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Fájlkezelő</h3>
                <p className="text-muted-foreground text-center max-w-sm mt-1">
                  A fájlkezelő funkció fejlesztés alatt áll.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
