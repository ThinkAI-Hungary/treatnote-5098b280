import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/useToastMessage';
import { CheckCircle2 } from 'lucide-react';
import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const authSchema = z.object({
  email: z.string().regex(emailRegex, 'Érvénytelen email cím'),
  password: z.string().min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Detect Supabase email confirmation callback in the URL hash
    const hash = window.location.hash;
    if (hash.includes('type=signup') || hash.includes('type=email_confirmation')) {
      // Supabase already processed the token and created a session.
      // We sign out immediately so the user must log in manually.
      supabase.auth.signOut().then(() => {
        setEmailConfirmed(true);
        // Clean the URL hash so it doesn't linger
        window.history.replaceState(null, '', window.location.pathname);
      });
      return;
    }

    // Prevent auto-redirect during the brief moment after signout but before AuthContext clears
    if (emailConfirmed) {
      return;
    }

    // Normal: if already logged in (no confirmation flow), go to dashboard
    if (user && !hash.includes('type=')) {
      navigate('/dashboard');
    }
  }, [user, navigate, emailConfirmed]);

  const handleSubmit = async (e: React.FormEvent) => {
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
          toast.error('Hibás email cím vagy jelszó');
        } else if (msg.includes('email not confirmed')) {
          toast.error('Kérem erősítse meg az email címét!');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Üdvözöljük!');
        navigate('/dashboard');
      }
    } catch (err) {
      toast.error('Váratlan hiba történt');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Email megerősítve képernyő ─────────────────────────────────────────────
  if (emailConfirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
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
            <Button className="w-full" onClick={() => setEmailConfirmed(false)}>
              Bejelentkezés
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Bejelentkezési form ───────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
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
          <form onSubmit={handleSubmit} className="space-y-4">
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
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Még nincs fiókja?{' '}
            <Link to="/solo-register" className="text-primary hover:underline font-medium">
              Regisztráció
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
