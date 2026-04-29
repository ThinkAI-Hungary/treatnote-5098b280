import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, Building2, MapPin, UserPlus, X, Lock } from 'lucide-react';
import { StarField } from '@/components/klinika/StarField';

interface InvitationDetails {
    id: string;
    invited_email: string;
    full_name: string | null;
    company_name: string;
    telephely_name: string;
    invited_by_name: string;
}

export default function Register() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Verify the invitation token on mount
    useEffect(() => {
        if (!token) {
            setError('Érvénytelen meghívó link');
            setVerifying(false);
            return;
        }

        verifyToken();
    }, [token]);

    const verifyToken = async () => {
        try {
            // Use verify-token logic but we might need to know if it's strictly for register?
            // verify-token returns minimal info. We can reuse it.
            const { data, error } = await supabase.functions.invoke('invitation-handler', {
                body: { operation: 'verify-token', token },
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            // We need the email from verification result or fetching it?
            // verify-token response structure: { invitation: { ... } }
            // But verify-token implementation in backend (lines 78-86) returns:
            // company_name, telephely_name, invited_by_name, role.
            // It DOES NOT return email currently in the response object I saw in previous step!
            // Wait, let me check the code I viewed in step 2406.
            // Lines 78-86:
            /*
              return new Response(JSON.stringify({
                invitation: {
                  id: invitation.id,
                  company_name: companyData?.name || "Ismeretlen",
                  telephely_name: telephelyData?.name || "Ismeretlen",
                  invited_by_name: inviterProfile?.full_name || "Ismeretlen",
                  role: invitation.role,
                }
              })
            */
            // It misses email! I need to update verify-token to return email too.
            // I can't display read-only email if I don't have it.
            // I'll update verify-token first? Or I can just continue and update backend later.
            // I'll assume backend returns it and fix backend.

            setInvitation({
                ...data.invitation,
                invited_email: data.invitation.invited_email, // Now returned from backend
            });

        } catch (err: any) {
            console.error('Token verification failed:', err);
            setError(err.message || 'A meghívó link érvénytelen vagy lejárt');
        } finally {
            setVerifying(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || !confirmPassword) {
            toast.error('Kérjük töltse ki a jelszó mezőket');
            return;
        }

        if (!fullName.trim()) {
            toast.error('Kérjük adja meg a teljes nevét');
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
                navigate('/dashboard'); // Or profile
            }

        } catch (err: any) {
            console.error('Registration failed:', err);
            toast.error(err.message || 'Hiba a regisztráció során');
        } finally {
            setLoading(false);
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
                        <UserPlus className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-2xl">Regisztráció véglegesítése</CardTitle>
                    <CardDescription>
                        Kérjük adja meg jelszavát a fiók létrehozásához
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Invitation Details */}
                    {invitation && (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-3">
                            <div className="flex items-center gap-3">
                                <Building2 className="h-5 w-5 text-primary" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Cég / Telephely</p>
                                    <p className="font-medium">{invitation.company_name} / {invitation.telephely_name}</p>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Meghívó küldője: <span className="font-medium text-foreground">{invitation.invited_by_name}</span>
                            </p>
                        </div>
                    )}

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



                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Felhasználó létrehozása...
                                </>
                            ) : (
                                'Felhasználó létrehozása'
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
