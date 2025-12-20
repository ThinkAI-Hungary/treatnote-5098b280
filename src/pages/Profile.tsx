import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
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
import { notifyFlexiConnectionChanged } from '@/hooks/useFlexiConnection';
import { X, Check, User, Building2, MapPin, Phone, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';

interface FlexiAuth {
  flexi_username: string | null;
  created_at: string;
}

interface ProfileData {
  full_name: string;
  phone: string;
  company_id: string | null;
  company_name: string | null;
  telephely_id: string | null;
  telephely_name: string | null;
}

const Profile = () => {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [flexiDialogOpen, setFlexiDialogOpen] = useState(false);
  const [flexiAuth, setFlexiAuth] = useState<FlexiAuth | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    phone: '',
    company_id: null,
    company_name: null,
    telephely_id: null,
    telephely_name: null,
  });

  useEffect(() => {
    const loadAllData = async () => {
      if (!user) {
        setDataReady(true);
        return;
      }
      
      setDataReady(false);
      try {
        await Promise.all([loadProfile(), loadFlexiAuth()]);
      } finally {
        setDataReady(true);
      }
    };

    if (!authLoading) {
      loadAllData();
    }
  }, [user, authLoading]);

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
      .select('full_name, phone, company_id, telephely_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      let companyName: string | null = null;
      let telephelyName: string | null = null;

      // Fetch company name if company_id exists
      if (data.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', data.company_id)
          .single();
        companyName = companyData?.name || null;
      }

      // Fetch telephely name if telephely_id exists
      if (data.telephely_id) {
        const { data: telephelyData } = await supabase
          .from('telephely')
          .select('name')
          .eq('id', data.telephely_id)
          .single();
        telephelyName = telephelyData?.name || null;
      }

      setProfile({
        full_name: data.full_name || '',
        phone: data.phone || '',
        company_id: data.company_id,
        company_name: companyName,
        telephely_id: data.telephely_id,
        telephely_name: telephelyName,
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
      notifyFlexiConnectionChanged();
      toast.success('Flexi-Dent sikeresen leválasztva');
    }
    setUnlinking(false);
  };

  const handleFlexiDialogClose = (open: boolean) => {
    setFlexiDialogOpen(open);
    if (!open) {
      loadFlexiAuth();
      notifyFlexiConnectionChanged();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        phone: profile.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Profil sikeresen frissítve');
    }

    setLoading(false);
  };

  // Show loading spinner until all data is loaded
  if (authLoading || !dataReady) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
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
              <Input id="email" type="email" value={user?.email || ''} disabled className="bg-muted" />
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
            
            {/* Company - Read Only */}
            <div className="space-y-2">
              <Label htmlFor="company" className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Cég neve
              </Label>
              <Input
                id="company"
                type="text"
                value={profile.company_name || 'Nincs hozzárendelve'}
                disabled
                className="bg-muted"
              />
              {!profile.company_id && (
                <p className="text-xs text-muted-foreground">
                  A cég hozzárendelést egy admin vagy klinika admin végezheti el.
                </p>
              )}
            </div>

            {/* Telephely - Read Only */}
            <div className="space-y-2">
              <Label htmlFor="telephely" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Telephely
              </Label>
              <Input
                id="telephely"
                type="text"
                value={profile.telephely_name || 'Nincs hozzárendelve'}
                disabled
                className="bg-muted"
              />
              {!profile.telephely_id && (
                <p className="text-xs text-muted-foreground">
                  A telephely hozzárendelést egy admin vagy klinika admin végezheti el.
                </p>
              )}
            </div>

            {/* Phone - Editable */}
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Telefonszám
              </Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+36 XX XXX XXXX"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? 'Mentés...' : 'Változtatások mentése'}
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
  );
};

export default Profile;
