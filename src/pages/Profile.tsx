import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import FlexiConnectDialog from '@/components/profile/FlexiConnectDialog';
import { notifyFlexiConnectionChanged } from '@/hooks/useFlexiConnection';
import { useKlinikaAdminRole } from '@/hooks/useKlinikaAdminRole';
import { useKlinikaAdmins } from '@/hooks/useKlinikaAdmins';
import { subscribeToTelephelyChanges } from '@/lib/telephelyEvents';
import { X, Check, User, Building2, MapPin, Phone, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { OnboardingTour, TourStep } from '@/components/klinika/OnboardingTour';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { PageLoader } from '@/components/PageLoader';
import { usePageLoadingSignal } from '@/contexts/PageLoadingContext';

const profileTourSteps: TourStep[] = [
  {
    target: '#full_name',
    title: 'Teljes név',
    content: 'Adja meg a teljes nevét. Ez a név fog megjelenni a rendszerben és a dokumentumokban.',
    position: 'bottom',
    spotlightYOffset: 10,
  },
  {
    target: '#company',
    title: 'Cég neve',
    content: 'A cég hozzárendelést egy admin vagy klinika admin végezheti el. Ez határozza meg, mely adatokhoz fér hozzá.',
    position: 'bottom',
    spotlightYOffset: 10,
  },
  {
    target: '#telephely',
    title: 'Telephely',
    content: 'A telephely meghatározza, melyik helyszínhez tartozik. Ezt szintén az admin állítja be.',
    position: 'bottom',
    spotlightYOffset: 10,
  },
  {
    target: '#phone',
    title: 'Telefonszám',
    content: 'Adja meg telefonszámát, hogy kollégái elérhessék Önt szükség esetén.',
    position: 'bottom',
    spotlightYOffset: 10,
  },
  {
    target: '[data-tour="flexi-card"]',
    title: 'Flexi-Dent Integráció',
    content: 'Csatlakoztassa Flexi-Dent fiókját az adatok szinkronizálásához. Ez lehetővé teszi a páciensadatok és kezelések automatikus átvitelét.',
    position: 'top',
  },
];

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
  flexi_domain: string | null;
  voice_recording_preference: 'flexident' | 'treatnote_native' | null;
}

const Profile = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [flexiDialogOpen, setFlexiDialogOpen] = useState(false);
  const [flexiAuth, setFlexiAuth] = useState<FlexiAuth | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const { isKlinikaAdmin, loading: klinikaAdminLoading } = useKlinikaAdminRole();
  const { admins: klinikaAdmins, isLoading: adminsLoading } = useKlinikaAdmins();
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    phone: '',
    company_id: null,
    company_name: null,
    telephely_id: null,
    telephely_name: null,
    flexi_domain: null,
    voice_recording_preference: null,
  });

  useEffect(() => {
    const loadAllData = async () => {
      if (!user) {
        setDataReady(true);
        return;
      }

      setDataReady(false);
      try {
        // Load profile FIRST to resolve telephely_id, then load flexi auth scoped to that telephely.
        // Running them in parallel would cause loadFlexiAuth to read telephely_id=null from state.
        const resolvedTelephelyId = await loadProfile();
        await loadFlexiAuth(resolvedTelephelyId ?? undefined);
      } finally {
        setDataReady(true);
      }
    };

    if (!authLoading) {
      loadAllData();
    }
  }, [user, authLoading]);

  // Listen for telephely data changes (domain updates, etc.)
  useEffect(() => {
    const unsubscribe = subscribeToTelephelyChanges(() => {
      loadProfile();
    });
    return unsubscribe;
  }, [user]);

  // Auto-open Flexi dialog if URL param is present
  useEffect(() => {
    if (searchParams.get('openFlexi') === 'true' && !flexiAuth) {
      setFlexiDialogOpen(true);
      setSearchParams({});
    }
  }, [searchParams, flexiAuth, setSearchParams]);

  const loadProfile = async (): Promise<string | null> => {
    if (!user) return null;

    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, company_id, telephely_id, current_telephely_id, voice_recording_preference')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      let companyName: string | null = null;
      let telephelyName: string | null = null;
      let flexiDomain: string | null = null;
      let resolvedCompanyId = data.company_id;
      // Prefer current_telephely_id (active) over telephely_id (home)
      let resolvedTelephelyId = (data as any).current_telephely_id || data.telephely_id;

      // Fallback: if profile has no telephely_id, check telephely_memberships
      if (!resolvedTelephelyId) {
        const { data: membership } = await supabase
          .from('telephely_memberships')
          .select('telephely_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (membership) {
          resolvedTelephelyId = membership.telephely_id;
        }
      }

      // Fetch company name if company_id exists
      if (resolvedCompanyId) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', resolvedCompanyId)
          .single();
        companyName = companyData?.name || null;
      }

      // Fetch telephely name and flexi_domain if telephely_id exists
      if (resolvedTelephelyId) {
        const { data: telephelyData } = await supabase
          .from('telephely')
          .select('name, flexi_domain, company_id')
          .eq('id', resolvedTelephelyId)
          .single();
        telephelyName = telephelyData?.name || null;
        flexiDomain = telephelyData?.flexi_domain || null;

        // If no company resolved yet, get it from the telephely
        if (!resolvedCompanyId && telephelyData?.company_id) {
          resolvedCompanyId = telephelyData.company_id;
          const { data: companyData } = await supabase
            .from('companies')
            .select('name')
            .eq('id', resolvedCompanyId)
            .single();
          companyName = companyData?.name || null;
        }
      }

      setProfile({
        full_name: data.full_name || '',
        phone: data.phone || '',
        company_id: resolvedCompanyId,
        company_name: companyName,
        telephely_id: resolvedTelephelyId,
        telephely_name: telephelyName,
        flexi_domain: flexiDomain,
        voice_recording_preference: data.voice_recording_preference as any || 'treatnote_native',
      });
      return resolvedTelephelyId;
    }
    return null;
  };

  const loadFlexiAuth = async (telephelyId?: string | null) => {
    if (!user) return;

    // telephelyId is passed explicitly (resolved from loadProfile) to avoid
    // reading stale null from profile state when called right after loadProfile.
    const effectiveTelephelyId = telephelyId ?? profile.telephely_id;

    const query = supabase
      .from('flexi_auth')
      .select('flexi_username, created_at')
      .eq('user_id', user.id);

    // Scope to telephely if known
    const { data } = effectiveTelephelyId
      ? await query.eq('telephely_id', effectiveTelephelyId).maybeSingle()
      : await query.is('telephely_id', null).maybeSingle();

    setFlexiAuth(data);
  };

  const handleUnlinkFlexi = async () => {
    if (!user) return;

    setUnlinking(true);
    const telephelyId = profile.telephely_id;

    const query = supabase
      .from('flexi_auth')
      .delete()
      .eq('user_id', user.id);

    const { error } = telephelyId
      ? await query.eq('telephely_id', telephelyId)
      : await query.is('telephely_id', null);

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
      loadFlexiAuth(profile.telephely_id);
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

  const handleVoicePrefChange = async (val: string) => {
    if (!user) return;
    
    // Optimistic update
    setProfile({ ...profile, voice_recording_preference: val as any });
    
    const { error } = await supabase
      .from('profiles')
      .update({
        voice_recording_preference: val,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
      
    if (error) {
      toast.error('Hiba a beállítás mentésekor: ' + error.message);
    } else {
      toast.success('Hangfelvétel beállítás elmentve');
    }
  };

  const {
    showTour,
    startTour,
    completeTour,
    skipTour,
  } = useOnboardingTour({
    tourKey: 'profile-tour',
    isEligible: dataReady && !!user,
    autoShowForNewUsers: true,
    newUserDays: 7,
  });

  // Signal loading to sidebar indicator
  usePageLoadingSignal(authLoading || !dataReady);

  // Show loading spinner until all data is loaded
  if (authLoading || !dataReady) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profil beállítások</h1>
          <p className="text-muted-foreground mt-2">Fiók adatok kezelése</p>
        </div>
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

      <Card data-tour="flexi-card">
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
          ) : !profile.flexi_domain ? (
            // No domain set - show disabled button with appropriate message
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    {isKlinikaAdmin ? (
                      <Button
                        variant="outline"
                        className="opacity-50 cursor-pointer"
                        onClick={() => navigate('/klinika-admin?tab=szotar&openDomain=true')}
                      >
                        <AlertCircle className="mr-2 h-4 w-4 text-amber-500" />
                        Flexi hozzácsatolás
                      </Button>
                    ) : (
                      <Button variant="outline" disabled className="opacity-50">
                        <AlertCircle className="mr-2 h-4 w-4 text-amber-500" />
                        Flexi hozzácsatolás
                      </Button>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {isKlinikaAdmin ? (
                    <p>Kérem állítsa be a klinika domainjét</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-medium">Kérjük, lépjen kapcsolatba a klinika adminisztrátorával a domain beállításához:</p>
                      {adminsLoading ? (
                        <p className="text-sm text-muted-foreground">Betöltés...</p>
                      ) : klinikaAdmins.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {klinikaAdmins.map((admin) => (
                            <li key={admin.id}>
                              <span className="font-medium">{admin.full_name || 'Névtelen'}</span>
                              {admin.phone && <span className="ml-2 text-muted-foreground">({admin.phone})</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nincs elérhető adminisztrátor</p>
                      )}
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button onClick={() => setFlexiDialogOpen(true)}>
              Flexi hozzácsatolás
            </Button>
          )}
          
          <div className="mt-6 pt-6 border-t">
            <h4 className="text-sm font-medium mb-4">Hangfelvétel beállítások</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Alapértelmezett hangfelvétel mód a Páciens Profilban</Label>
                <Select
                  disabled={!flexiAuth}
                  value={(!flexiAuth ? 'treatnote_native' : profile.voice_recording_preference) || 'treatnote_native'}
                  onValueChange={handleVoicePrefChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Válasszon módot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="treatnote_native">Beépített (Native) Rendszer</SelectItem>
                    <SelectItem value="flexident" disabled={!flexiAuth}>
                      Flexi-Dent integrált (Hagyományos)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {!flexiAuth ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Mivel nincs Flexi-Dent fiókja csatlakoztatva, csak a beépített hangfelvétel rendszer használható.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    Döntse el, melyik rendszert szeretné használni alapesetben a Pácienslapon. Javasoljuk a Beépített Rendszert.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <FlexiConnectDialog
        open={flexiDialogOpen}
        onOpenChange={handleFlexiDialogClose}
        telephelyId={profile.telephely_id}
      />

      <OnboardingTour
        steps={profileTourSteps}
        isOpen={showTour}
        onComplete={completeTour}
        onSkip={skipTour}
      />
    </div>
  );
};

export default Profile;
