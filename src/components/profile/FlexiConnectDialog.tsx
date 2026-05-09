import { useState, useRef } from 'react';
import { z } from 'zod';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/useToastMessage';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Loader2, AlertTriangle, TriangleAlert } from 'lucide-react';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const flexiSchema = z.object({
  flexiEmail: z.string().min(1, 'Email megadása kötelező').regex(emailRegex, 'Érvénytelen email cím').max(255, 'Email max 255 karakter'),
  flexiPassword: z.string().min(1, 'Jelszó megadása kötelező').max(128, 'Jelszó max 128 karakter'),
});

interface FlexiConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError?: () => void;
  telephelyId?: string | null;
}

interface FailedAttempt { email: string; password: string; }

const SESSION_KEY = 'flexi_failed_attempt';

function getFailedAttempt(): FailedAttempt | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as FailedAttempt) : null;
  } catch { return null; }
}

function setFailedAttempt(attempt: FailedAttempt | null) {
  try {
    if (attempt) sessionStorage.setItem(SESSION_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

type View = 'form' | 'error' | 'repeat';

const FlexiConnectDialog = ({ open, onOpenChange, onError, telephelyId }: FlexiConnectDialogProps) => {
  const [view, setView] = useState<View>('form');
  const [loading, setLoading] = useState(false);

  const [flexiEmail, setFlexiEmail] = useState('');
  const [flexiPassword, setFlexiPassword] = useState('');
  const [flexiPasswordConfirm, setFlexiPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [isConflict, setIsConflict] = useState(false);
  const [repeatPasswordRevealed, setRepeatPasswordRevealed] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const resetForm = () => {
    setFlexiEmail('');
    setFlexiPassword('');
    setFlexiPasswordConfirm('');
    setErrors({});
    setShowPassword(false);
    setView('form');
  };

  const handleCancel = () => {
    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      toast.info('Flexi-Dent hozzácsatolás megszakítva');
    }
    resetForm();
    onOpenChange(false);
  };

  const doSubmit = async () => {
    setLoading(true);
    abortControllerRef.current = new AbortController();

    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setLoading(false);
        toast.error('A Flexi-Dent szerver nem válaszolt időben. Kérjük próbálja újra később.');
      }
    }, 300000);

    try {
      const { data, error } = await supabase.functions.invoke('flexi-connect', {
        body: { flexiEmail, flexiPassword, telephely_id: telephelyId ?? null },
      });

      clearTimeout(timeoutId);
      if (abortControllerRef.current?.signal.aborted) return;

      if (error) {
        let msg = 'Nem sikerült a Flexi-Dent hozzácsatolás';
        try {
          if (error instanceof FunctionsHttpError && error.context) {
            const body = await error.context.json();
            if (body?.message) msg = body.message;
          } else if (error.message) {
            msg = error.message;
          }
        } catch {
          if (error.message) msg = error.message;
        }
        setFailedAttempt({ email: flexiEmail, password: flexiPassword });
        // 409 = flexi account already claimed by another user
        const isConflictError = error instanceof FunctionsHttpError && error.context?.status === 409;
        setIsConflict(isConflictError);
        setErrorMessage(msg);
        setView('error');
        onError?.();
        return;
      }

      if (data?.success) {
        setFailedAttempt(null);
        toast.success(data.message || 'Flexi-Dent sikeresen hozzácsatolva!');
        resetForm();
        onOpenChange(false);
      } else {
        setFailedAttempt({ email: flexiEmail, password: flexiPassword });
        setIsConflict(false);
        setErrorMessage(data?.message || 'Flexi-Dent bejelentkezés sikertelen');
        setView('error');
        onError?.();
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (abortControllerRef.current?.signal.aborted) return;
      console.error('Flexi connect error:', err);
      setFailedAttempt({ email: flexiEmail, password: flexiPassword });
      setErrorMessage(err.message || 'Nem sikerült a Flexi-Dent hozzácsatolás');
      setView('error');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = flexiSchema.safeParse({ flexiEmail, flexiPassword });
    const fieldErrors: Record<string, string> = {};

    if (!result.success) {
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
    }
    if (flexiPassword !== flexiPasswordConfirm) {
      fieldErrors.flexiPasswordConfirm = 'A két jelszó nem egyezik';
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      toast.error('Kérjük javítsa a hibás mezőket');
      return;
    }
    setErrors({});

    const lastFailed = getFailedAttempt();
    if (lastFailed && lastFailed.email === flexiEmail && lastFailed.password === flexiPassword) {
      setRepeatPasswordRevealed(false);
      setView('repeat');
      return;
    }

    await doSubmit();
  };

  // Title and description per view
  const viewMeta: Record<View, { title: React.ReactNode; description?: string }> = {
    form: { title: 'Flexi-Dent Hozzácsatolás' },
    error: {
      title: (
        <span className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Flexi-Dent hozzácsatolás sikertelen
        </span>
      ),
      description: 'A bejelentkezés nem sikerült. Kérjük ellenőrizze az alábbi adatokat.',
    },
    repeat: {
      title: (
        <span className="flex items-center gap-2 text-amber-500">
          <TriangleAlert className="h-5 w-5 shrink-0" />
          Korábban sikertelen kombinációt adott meg
        </span>
      ),
      description:
        'Ez az email és jelszó kombináció már egyszer sikertelen volt. Kérjük ellenőrizze a megadott adatokat mielőtt újra próbálkozik.',
    },
  };

  const meta = viewMeta[view];

  return (
    <Dialog
      open={open}
      onOpenChange={loading || view !== 'form' ? undefined : onOpenChange}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          {meta.description && (
            <DialogDescription className="pt-1">{meta.description}</DialogDescription>
          )}
        </DialogHeader>

        {/* ── FORM VIEW ── */}
        {view === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flexi-email">Flexi email</Label>
              <Input
                id="flexi-email"
                type="email"
                value={flexiEmail}
                onChange={(e) => setFlexiEmail(e.target.value)}
                placeholder="email@example.com"
                disabled={loading}
                maxLength={255}
                className={errors.flexiEmail ? 'border-destructive' : ''}
              />
              {errors.flexiEmail && <p className="text-xs text-destructive">{errors.flexiEmail}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="flexi-password">Flexi jelszó</Label>
              <div className="relative">
                <Input
                  id="flexi-password"
                  type={showPassword ? 'text' : 'password'}
                  value={flexiPassword}
                  onChange={(e) => setFlexiPassword(e.target.value)}
                  disabled={loading}
                  maxLength={128}
                  autoComplete="new-password"
                  className={`pr-10 ${errors.flexiPassword ? 'border-destructive' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.flexiPassword && <p className="text-xs text-destructive">{errors.flexiPassword}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="flexi-password-confirm">Jelszó megerősítése</Label>
              <Input
                id="flexi-password-confirm"
                type={showPassword ? 'text' : 'password'}
                value={flexiPasswordConfirm}
                onChange={(e) => setFlexiPasswordConfirm(e.target.value)}
                disabled={loading}
                maxLength={128}
                autoComplete="new-password"
                className={errors.flexiPasswordConfirm ? 'border-destructive' : ''}
              />
              {errors.flexiPasswordConfirm && (
                <p className="text-xs text-destructive">{errors.flexiPasswordConfirm}</p>
              )}
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Várakozás a Flexi-Dent válaszára...</span>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Mégse
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Csatlakozás...
                  </>
                ) : (
                  'Flexi hozzácsatolás'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* ── ERROR VIEW ── */}
        {view === 'error' && (
          <>
            {isConflict ? (
              /* Conflict: flexi account already owned by another user */
              <div className="space-y-3 py-4 text-sm">
                <p className="text-foreground">{errorMessage}</p>
                <p className="text-muted-foreground text-xs">
                  Ha ez az Ön Flexi-Dent fiókja, kérjük lépjen kapcsolatba az adminisztrátorral.
                </p>
              </div>
            ) : (
              /* Login failure: guide the user to check their data */
              <div className="space-y-3 py-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Kérjük ellenőrizze az alábbiakat:</p>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">1.</span>
                    <span>
                      <span className="font-medium text-foreground">Domain beállítás</span> — Győződjön meg róla, hogy a megfelelő Flexi-Dent aldomain van megadva a klinika beállításaiban.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">2.</span>
                    <span>
                      <span className="font-medium text-foreground">Email cím</span> — Ellenőrizze, hogy pontosan azt az email-t adta meg, amellyel a Flexi-Dent fiókba be tud lépni.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5">3.</span>
                    <span>
                      <span className="font-medium text-foreground">Jelszó</span> — Győződjön meg a jelszó helyességéről. Próbáljon meg közvetlenül belépni a Flexi-Dent weboldalon.
                    </span>
                  </li>
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setView('form')}>Értettem</Button>
            </DialogFooter>
          </>
        )}

        {/* ── REPEAT WARNING VIEW ── */}
        {view === 'repeat' && (
          <>
            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-mono font-medium">{getFailedAttempt()?.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Jelszó:</span>
                  {repeatPasswordRevealed ? (
                    <span className="font-mono font-medium">{getFailedAttempt()?.password}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRepeatPasswordRevealed(true)}
                      className="flex items-center gap-1.5 text-primary text-xs font-medium hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Jelszó megtekintése
                    </button>
                  )}
                </div>
              </div>
              {!repeatPasswordRevealed && (
                <p className="text-xs text-muted-foreground">
                  A folytatáshoz először tekintse meg a jelszót, majd erősítse meg, hogy helyesnek találja.
                </p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setView('form')}>
                Mégse
              </Button>
              <Button
                type="button"
                disabled={!repeatPasswordRevealed}
                onClick={() => { setView('form'); doSubmit(); }}
              >
                Megtekintettem, újra próbálom
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FlexiConnectDialog;
