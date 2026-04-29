import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { Loader2, UserPlus, Eye, EyeOff } from 'lucide-react';
import { StarField } from '@/components/klinika/StarField';
import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = z.object({
    full_name: z.string().min(2, 'A név legalább 2 karakter legyen'),
    email: z.string().regex(emailRegex, 'Érvénytelen email cím'),
    password: z.string().min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
    confirmPassword: z.string(),

}).refine((d) => d.password === d.confirmPassword, {
    message: 'A két jelszó nem egyezik',
    path: ['confirmPassword'],
});

export default function SoloRegister() {
    const navigate = useNavigate();
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const observer = new MutationObserver(() =>
            setIsDark(document.documentElement.classList.contains('dark'))
        );
        observer.observe(document.documentElement, { attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [registered, setRegistered] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const result = schema.safeParse({ full_name: fullName, email, password, confirmPassword });
        if (!result.success) {
            const fieldErrors: Record<string, string> = {};
            result.error.errors.forEach((err) => {
                if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
            });
            setErrors(fieldErrors);
            toast.error('Kérjük javítsa a hibás mezőket');
            return;
        }
        setErrors({});
        setLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('solo-register', {
                body: { email, password, full_name: fullName.trim() },
            });

            if (error) {
                // data is null on non-2xx; actual JSON body is in error.context (Response object)
                let message = 'Hiba a regisztráció során';
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const body = await (error as any).context?.json?.();
                    if (body?.error) message = body.error;
                } catch {
                    message = error.message || message;
                }
                throw new Error(message);
            }
            if (data?.error) throw new Error(data.error);

            toast.success('Sikeres regisztráció! Megerősítő email elküldve.');
            setRegisteredEmail(email);
            setRegistered(true);
        } catch (err: any) {
            toast.error(err.message || 'Hiba a regisztráció során');
        } finally {
            setLoading(false);
        }
    };

    // ── Email confirmation pending screen ───────────────────────────────────
    if (registered) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                {!isDark && <StarField />}
                <Card className="relative z-10 w-full max-w-md border-primary/20 bg-card/95 backdrop-blur-sm text-center">
                    <CardHeader>
                        <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                            <UserPlus className="h-7 w-7 text-primary-foreground" />
                        </div>
                        <CardTitle className="text-2xl">Erősítse meg az email címét</CardTitle>
                        <CardDescription className="pt-1">
                            Küldtünk egy megerősítő emailt erre a címre:
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="font-medium text-primary bg-primary/5 border border-primary/20 rounded-lg py-2 px-4">
                            {registeredEmail}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Kattintson az emailben lévő linkre a fiók aktiválásához. Utána tud bejelentkezni.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Nem kapott emailt? Ellenőrizze a spam mappát, vagy próbálja újra néhány perc múlva.
                        </p>
                        <Button variant="outline" className="w-full" onClick={() => navigate('/auth')}>
                            Vissza a bejelentkezéshez
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            {!isDark && <StarField />}
            <Card className="relative z-10 w-full max-w-md border-primary/20 bg-card/95 backdrop-blur-sm">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <UserPlus className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <CardTitle className="text-2xl">Regisztráció</CardTitle>
                    <CardDescription>
                        Hozzon létre személyes TreatNote fiókot
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="fullName">Teljes név</Label>
                            <Input
                                id="fullName"
                                type="text"
                                placeholder="Dr. Kiss Péter"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                disabled={loading}
                                className={errors.full_name ? 'border-destructive' : ''}
                            />
                            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email cím</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="email@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={loading}
                                className={errors.email ? 'border-destructive' : ''}
                            />
                            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Jelszó</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                    className={`pr-10 ${errors.password ? 'border-destructive' : ''}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Jelszó megerősítése</Label>
                            <Input
                                id="confirmPassword"
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={loading}
                                className={errors.confirmPassword ? 'border-destructive' : ''}
                            />
                            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                        </div>



                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Fiók létrehozása...
                                </>
                            ) : (
                                'Regisztráció'
                            )}
                        </Button>
                    </form>

                    <p className="mt-4 text-center text-sm text-muted-foreground">
                        Már van fiókja?{' '}
                        <Link to="/auth" className="text-primary hover:underline font-medium">
                            Bejelentkezés
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
