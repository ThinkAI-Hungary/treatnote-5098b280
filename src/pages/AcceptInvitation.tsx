import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Building2, MapPin, Check, X } from 'lucide-react';
import { StarField } from '@/components/klinika/StarField';

interface InvitationDetails {
  id: string;
  company_name: string;
  telephely_name: string;
  invited_by_name: string;
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Verify the invitation token on mount
  useEffect(() => {
    if (!token) {
      setError('Érvénytelen meghívó link');
      setVerifying(false);
      return;
    }

    verifyToken();
  }, [token]);

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
        setEmail(session.user.email || '');
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setIsLoggedIn(true);
        setEmail(session.user.email || '');
      } else {
        setIsLoggedIn(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const verifyToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('invitation-handler', {
        body: { operation: 'verify-token', token },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setInvitation(data.invitation);
    } catch (err: any) {
      console.error('Token verification failed:', err);
      setError(err.message || 'A meghívó link érvénytelen vagy lejárt');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Kérjük töltse ki az email és jelszó mezőket');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      toast.success('Sikeres bejelentkezés');
    } catch (err: any) {
      toast.error(err.message || 'Bejelentkezési hiba');
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (response: 'accepted' | 'declined') => {
    if (!token) return;

    setResponding(true);
    try {
      const { data, error } = await supabase.functions.invoke('invitation-handler', {
        body: { operation: 'respond-invitation', token, response },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (response === 'accepted') {
        toast.success('Meghívás elfogadva! Üdvözlünk az organizációban.');
        navigate('/profile');
      } else {
        toast.info('Meghívás elutasítva');
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Error responding to invitation:', err);
      toast.error(err.message || 'Hiba történt a válaszadás során');
    } finally {
      setResponding(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <StarField />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Meghívó ellenőrzése...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <StarField />
        <Card className="relative z-10 w-full max-w-md border-destructive/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <X className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Érvénytelen meghívó</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Vissza a bejelentkezéshez
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <StarField />
      <Card className="relative z-10 w-full max-w-md border-primary/20 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Meghívás elfogadása</CardTitle>
          <CardDescription>
            Meghívást kapott a következő organizációba
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Invitation Details */}
          {invitation && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Cég neve</p>
                  <p className="font-medium">{invitation.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-xs text-muted-foreground">Telephely</p>
                  <p className="font-medium">{invitation.telephely_name}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Meghívó küldője: <span className="font-medium text-foreground">{invitation.invited_by_name}</span>
              </p>
            </div>
          )}

          {/* Show login form if not logged in */}
          {!isLoggedIn ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Kérjük jelentkezzen be a meghívás elfogadásához
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Felhasználónév</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Jelszó</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Bejelentkezés...
                  </>
                ) : (
                  'Bejelentkezés'
                )}
              </Button>
            </form>
          ) : (
            /* Show accept/decline buttons if logged in */
            <div className="space-y-4">
              <p className="text-sm text-center text-muted-foreground">
                Bejelentkezve: <span className="font-medium text-foreground">{email}</span>
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => handleRespond('declined')}
                  disabled={responding}
                >
                  {responding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <X className="mr-2 h-4 w-4" />
                      Elutasítás
                    </>
                  )}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => handleRespond('accepted')}
                  disabled={responding}
                >
                  {responding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Elfogadás
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
