import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import FlexiConnectDialog from '@/components/profile/FlexiConnectDialog';
import { X, Check, User } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

interface FlexiAuth {
  flexi_username: string | null;
  created_at: string;
}

const Profile = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [flexiDialogOpen, setFlexiDialogOpen] = useState(false);
  const [flexiAuth, setFlexiAuth] = useState<FlexiAuth | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [profile, setProfile] = useState({
    full_name: '',
    company_name: '',
    phone: '',
  });

  useEffect(() => {
    loadProfile();
    loadFlexiAuth();
  }, [user]);

  // Auto-open Flexi dialog if URL param is present
  useEffect(() => {
    if (searchParams.get('openFlexi') === 'true' && !flexiAuth) {
      setFlexiDialogOpen(true);
      setSearchParams({});
    }
  }, [searchParams, flexiAuth, setSearchParams]);

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setProfile({
        full_name: data.full_name || '',
        company_name: data.company_name || '',
        phone: data.phone || '',
      });
    }
  };

  const loadFlexiAuth = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('flexi_auth')
      .select('flexi_username, created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    setFlexiAuth(data);
  };

  const handleUnlinkFlexi = async () => {
    if (!user) return;

    setUnlinking(true);
    const { error } = await supabase
      .from('flexi_auth')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      toast.error('Nem sikerült a Flexi-Dent leválasztása');
    } else {
      setFlexiAuth(null);
      toast.success('Flexi-Dent sikeresen leválasztva');
    }
    setUnlinking(false);
  };

  const handleFlexiDialogClose = (open: boolean) => {
    setFlexiDialogOpen(open);
    if (!open) {
      loadFlexiAuth();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        ...profile,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Profil sikeresen frissítve');
    }

    setLoading(false);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profil beállítások</h1>
          <p className="text-muted-foreground mt-2">Fiók adatok kezelése</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Személyes adatok
            </CardTitle>
            <CardDescription>Profil adatok módosítása</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name">Teljes név</Label>
                <Input
                  id="full_name"
                  type="text"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_name">Cég neve</Label>
                <Input
                  id="company_name"
                  type="text"
                  value={profile.company_name}
                  onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefonszám</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? 'Mentés...' : 'Változások mentése'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flexi-Dent Integráció</CardTitle>
            <CardDescription>Csatlakoztassa Flexi-Dent fiókját</CardDescription>
          </CardHeader>
          <CardContent>
            {flexiAuth ? (
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{flexiAuth.flexi_username}</p>
                    <p className="text-sm text-muted-foreground">
                      Csatlakoztatva: {format(new Date(flexiAuth.created_at), 'yyyy. MMMM d. HH:mm', { locale: hu })}
                    </p>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={unlinking}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Flexi-Dent leválasztása</AlertDialogTitle>
                      <AlertDialogDescription>
                        Biztosan le szeretné választani a Flexi-Dent fiókját ({flexiAuth.flexi_username})? 
                        A művelet nem vonható vissza, és újra be kell jelentkeznie a csatlakoztatáshoz.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Mégse</AlertDialogCancel>
                      <AlertDialogAction onClick={handleUnlinkFlexi} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Leválasztás
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : (
              <Button onClick={() => setFlexiDialogOpen(true)}>
                Flexi hozzácsatolás
              </Button>
            )}
          </CardContent>
        </Card>

        <FlexiConnectDialog 
          open={flexiDialogOpen} 
          onOpenChange={handleFlexiDialogClose} 
        />
      </div>
    </Layout>
  );
};

export default Profile;
