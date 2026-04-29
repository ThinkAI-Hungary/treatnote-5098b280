import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, Building2, MapPin, Check, X, UserPlus } from 'lucide-react';
import { StarField } from '@/components/klinika/StarField';

interface InvitationDetails {
  id: string;
  company_name: string;
  telephely_name: string;
  invited_by_name: string;
  invited_email: string;
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [voiceRecordingPreference, setVoiceRecordingPreference] = useState<'flexident' | 'treatnote_native'>('treatnote_native');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userExists, setUserExists] = useState<boolean | null>(null);

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

      // Check if user already has an account
      const invitedEmail = data.invitation.invited_email;
      if (invitedEmail) {
        try {
          const { data: checkData } = await supabase.functions.invoke('invitation-handler', {
            body: { operation: 'check-user', email: invitedEmail },
          });
          setUserExists(checkData?.exists ?? false);
        } catch {
          // If check fails, assume user exists (safer — shows login form)
          setUserExists(true);
        }
      }
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast.error('Kérjük adja meg a teljes nevét');
      return;
    }

    if (!password || !confirmPassword) {
      toast.error('Kérjük töltse ki a jelszó mezőket');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('A jelszavak nem egyeznek');
      return;
    }

    if (password.length < 6) {
      toast.error('A jelszónak legalább 6 karakternek kell lennie');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('invitation-handler', {
        body: {
          operation: 'register-invited-user',
          token,
          password,
          full_name: fullName.trim(),
          voice_recording_preference: voiceRecordingPreference,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Sikeres regisztráció!');

      // Auto login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: password,
      });

      if (loginError) {
        console.error('Auto login failed:', loginError);
        toast.info('Sikeres regisztráció. Kérjük jelentkezzen be.');
        navigate('/auth');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      toast.error(err.message || 'Hiba a regisztráció során');
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

  // Determine if this is a new user registration flow
  const isNewUserFlow = !isLoggedIn && userExists === false;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <StarField />
      <Card className="relative z-10 w-full max-w-md border-primary/20 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            {isNewUserFlow ? (
              <UserPlus className="h-7 w-7 text-primary-foreground" />
            ) : (
              <Building2 className="h-7 w-7 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {isNewUserFlow ? 'Regisztráció és meghívás elfogadása' : 'Meghívás elfogadása'}
          </CardTitle>
          <CardDescription>
            {isNewUserFlow
              ? 'Hozza létre fiókját a meghívás elfogadásához'
              : 'Meghívást kapott a következő organizációba'}
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

          {/* NEW USER: Registration form */}
          {isNewUserFlow ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Teljes név</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Teljes neve"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Felhasználónév</Label>
                <Input
                  id="email"
                  type="email"
                  value={invitation?.invited_email || ''}
                  readOnly
                  className="bg-muted text-muted-foreground cursor-not-allowed"
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
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Jelszó megerősítése</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-3 pt-2 pb-2">
                <Label className="text-base">Működési mód</Label>
                <RadioGroup 
                    value={voiceRecordingPreference} 
                    onValueChange={(v: 'flexident' | 'treatnote_native') => setVoiceRecordingPreference(v)}
                    disabled={loading}
                    className="flex flex-col space-y-2"
                >
                    <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setVoiceRecordingPreference('treatnote_native')}>
                        <RadioGroupItem value="treatnote_native" id="native" className="mt-1" />
                        <div className="space-y-1 cursor-pointer">
                            <Label htmlFor="native" className="font-semibold cursor-pointer">TreatNote Natív (Standalone)</Label>
                            <p className="text-sm text-muted-foreground">Rendszerünk teljes körű használata függetlenül, FlexiDent összekapcsolás nélkül. Manuális szótár és szabály rögzítés.</p>
                        </div>
                    </div>
                    <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4 hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => setVoiceRecordingPreference('flexident')}>
                        <RadioGroupItem value="flexident" id="flexi" className="mt-1" />
                        <div className="space-y-1 cursor-pointer">
                            <Label htmlFor="flexi" className="font-semibold cursor-pointer">FlexiDent</Label>
                            <p className="text-sm text-muted-foreground">Közvetlen szinkronizáció meglévő FlexiDent fiókkal. Automatikus páciens és beavatkozás betöltés.</p>
                        </div>
                    </div>
                </RadioGroup>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Regisztráció...
                  </>
                ) : (
                  'Regisztráció és elfogadás'
                )}
              </Button>
            </form>
          ) : !isLoggedIn ? (
            /* EXISTING USER: Show login form */
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
            /* LOGGED IN: Show accept/decline buttons */
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
