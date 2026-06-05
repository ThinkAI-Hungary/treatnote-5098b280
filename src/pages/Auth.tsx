import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/useToastMessage';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authSchema = z.object({
  email: z.string().regex(emailRegex, 'Érvénytelen email cím'),
  password: z.string().min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
});

const passwordSchema = z.object({
  password: z.string().min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
  confirmPassword: z.string().min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "A két jelszó nem egyezik",
  path: ["confirmPassword"],
});

type ViewMode = 'login' | 'forgot_password' | 'recovery_mode' | 'email_confirmed';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('login');
  
  const { signIn, resetPasswordForEmail, updatePassword, signOut, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Detect Supabase email confirmation or recovery callback in the URL hash or query parameter
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    
    if (hash.includes('type=recovery')) {
      setView('recovery_mode');
      // Do not sign out, we need the session to update the password!
      // Wait before clearing the hash so Supabase Auth has time to process the token
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
      }, 500);
      return;
    }

    if (hash.includes('type=signup') || hash.includes('type=email_confirmation') || params.get('confirmed') === 'true') {
      // Supabase already processed the token and created a session.
      // We sign out immediately so the user must log in manually.
      supabase.auth.signOut().then(() => {
        setView('email_confirmed');
        // Clean the URL hash and query string so it doesn't linger
        window.history.replaceState(null, '', window.location.pathname);
      });
      return;
    }

    // Prevent auto-redirect during the brief moment after signout but before AuthContext clears
    if (view === 'email_confirmed' || view === 'recovery_mode') {
      return;
    }

    if (user && !hash.includes('type=')) {
      if (user.email === 'zoli@thinkai.hu') {
        navigate('/zoli-chart', { state: { fromAuth: true } });
      } else {
        navigate('/dashboard', { state: { fromAuth: true } });
      }
    }
  }, [user, navigate, view]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await signIn(email, password);
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('invalid login credentials')) {
          toast.error('Helytelen email cím vagy jelszó');
        } else if (msg.includes('email not confirmed')) {
          toast.error('Kérem erősítse meg az email címét!');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Üdvözöljük!');
        if (email.toLowerCase() === 'zoli@thinkai.hu') {
          navigate('/zoli-chart', { state: { fromAuth: true } });
        } else {
          navigate('/dashboard', { state: { fromAuth: true } });
        }
      }
    } catch (err) {
      toast.error('Váratlan hiba történt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailRegex.test(email)) {
      toast.error('Érvénytelen email cím');
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-recovery-email', {
        body: { 
          email, 
          redirect_url: window.location.origin + '/auth'
        }
      });
      
      if (error) throw error;
      
      toast.success('Elküldtük a jelszó visszaállító linket az e-mail címére!');
      setView('login');
    } catch (err: any) {
      toast.error(err.message || 'Váratlan hiba történt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      
      toast.success('Jelszó sikeresen megváltoztatva!');
      
      // Kijelentkeztetjük a felhasználót, hogy a friss jelszóval kelljen belépnie
      await signOut();
      setPassword('');
      setConfirmPassword('');
      setView('login');
    } catch (err: any) {
      toast.error(err.message || 'Váratlan hiba történt a jelszó módosítása közben');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Email megerősítve képernyő ─────────────────────────────────────────────
  if (view === 'email_confirmed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-semibold">Email megerősítve!</CardTitle>
            <CardDescription>
              Fiókja aktiválva. Most már be tud lépni az email cím és jelszava megadásával.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setView('login')}>
              Bejelentkezés
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Új jelszó megadása (Recovery Mode) ──────────────────────────────────────
  if (view === 'recovery_mode') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sparkle-blue/10">
              <KeyRound className="h-7 w-7 text-sparkle-blue" />
            </div>
            <CardTitle className="text-2xl font-semibold">Új jelszó beállítása</CardTitle>
            <CardDescription>
              Kérem adja meg az új jelszavát
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Új jelszó</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Új jelszó megerősítése</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Mentés...' : 'Jelszó frissítése'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Elfelejtett jelszó form ───────────────────────────────────────────────
  if (view === 'forgot_password') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-semibold">Elfelejtett jelszó</CardTitle>
            <CardDescription>
              Adja meg email címét, és küldünk egy linket a jelszava visszaállításához.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Küldés...' : 'Visszaállító link küldése'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm">
              <button 
                onClick={() => setView('login')}
                className="text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                Vissza a bejelentkezéshez
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Bejelentkezési form ───────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">
            Üdvözöljük!
          </CardTitle>
          <CardDescription>
            Adja meg belépési adatait
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Betöltés...' : 'Bejelentkezés'}
            </Button>
          </form>

        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
