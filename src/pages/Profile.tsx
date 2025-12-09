import { Layout } from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { User, Link2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Profile() {
  const { user } = useAuth();
  const { profile, loading } = useProfile();
  const [flexiEmail, setFlexiEmail] = useState('');
  const [flexiPassword, setFlexiPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleFlexiConnect = async () => {
    if (!flexiEmail || !flexiPassword) {
      toast.error('Kérjük töltse ki mindkét mezőt');
      return;
    }

    setConnecting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('flexi-connect', {
        body: { flexiEmail, flexiPassword },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success('Flexi-Dent fiók sikeresen összekapcsolva');
      setFlexiEmail('');
      setFlexiPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Hiba történt az összekapcsolás során');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profil</h1>
          <p className="text-muted-foreground mt-1">
            Felhasználói fiók beállításai
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Fiók adatok
              </CardTitle>
              <CardDescription>
                Az Ön fiókjának alapvető információi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email cím</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Teljes név</Label>
                <Input value={profile?.full_name || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Telefonszám</Label>
                <Input value={profile?.phone || ''} disabled />
              </div>
              {profile?.company_name && (
                <div className="space-y-2">
                  <Label>Cég</Label>
                  <Input value={profile.company_name} disabled />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Flexi-Dent összekapcsolás
              </CardTitle>
              <CardDescription>
                Kapcsolja össze Flexi-Dent fiókját a TreatNote-tal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="flexi-email">Flexi-Dent email</Label>
                <Input
                  id="flexi-email"
                  type="email"
                  placeholder="flexi@example.com"
                  value={flexiEmail}
                  onChange={(e) => setFlexiEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flexi-password">Flexi-Dent jelszó</Label>
                <Input
                  id="flexi-password"
                  type="password"
                  placeholder="••••••••"
                  value={flexiPassword}
                  onChange={(e) => setFlexiPassword(e.target.value)}
                />
              </div>
              <Button
                onClick={handleFlexiConnect}
                disabled={connecting}
                className="w-full"
              >
                {connecting ? 'Összekapcsolás...' : 'Flexi-Dent összekapcsolása'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
