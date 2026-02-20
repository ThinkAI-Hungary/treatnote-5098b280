import { useState, useRef } from 'react';
import { z } from 'zod';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const flexiSchema = z.object({
  flexiEmail: z.string().min(1, "Email megadása kötelező").email("Érvénytelen email cím").max(255, "Email max 255 karakter"),
  flexiPassword: z.string().min(1, "Jelszó megadása kötelező").max(128, "Jelszó max 128 karakter"),
});

interface FlexiConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onError?: () => void;
  telephelyId?: string | null;
}

const FlexiConnectDialog = ({ open, onOpenChange, onError, telephelyId }: FlexiConnectDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [flexiEmail, setFlexiEmail] = useState('');
  const [flexiPassword, setFlexiPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate with zod
    const result = flexiSchema.safeParse({ flexiEmail, flexiPassword });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast.error('Kérjük javítsa a hibás mezőket');
      return;
    }
    setErrors({});

    setLoading(true);
    abortControllerRef.current = new AbortController();

    // 1 minute timeout
    const timeoutId = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        setLoading(false);
        toast.error('A Flexi-Dent szerver nem válaszolt időben. Kérjük próbálja újra később.');
      }
    }, 60000);

    try {
      const { data, error } = await supabase.functions.invoke('flexi-connect', {
        body: { flexiEmail, flexiPassword, telephely_id: telephelyId ?? null },
      });

      clearTimeout(timeoutId);

      // Check if aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Handle errors - for non-2xx responses, read message from error.context (Response object)
      if (error) {
        let errorMessage = 'Nem sikerült a Flexi-Dent hozzácsatolás';
        try {
          // Per Supabase docs: use instanceof FunctionsHttpError and await error.context.json()
          if (error instanceof FunctionsHttpError && error.context) {
            const responseBody = await error.context.json();
            if (responseBody?.message) {
              errorMessage = responseBody.message;
            }
          } else if (error.message) {
            // Fallback to error.message if available
            errorMessage = error.message;
          }
        } catch {
          // If parsing fails, check if error has message property
          if (error.message) {
            errorMessage = error.message;
          }
        }
        toast.error(errorMessage);
        onError?.();
        setLoading(false);
        return;
      }

      if (data?.success) {
        toast.success(data.message || 'Flexi-Dent sikeresen hozzácsatolva!');
        setFlexiEmail('');
        setFlexiPassword('');
        onOpenChange(false);
      } else {
        // Non-success response (could be validation error from edge function)
        toast.error(data?.message || 'Flexi-Dent bejelentkezés sikertelen');
        onError?.();
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      console.error('Flexi connect error:', error);

      toast.error(error.message || 'Nem sikerült a Flexi-Dent hozzácsatolás');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      toast.info('Flexi-Dent hozzácsatolás megszakítva');
    }
    setFlexiEmail('');
    setFlexiPassword('');
    setErrors({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flexi-Dent Hozzácsatolás</DialogTitle>
        </DialogHeader>
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
              className={errors.flexiEmail ? "border-destructive" : ""}
            />
            {errors.flexiEmail && <p className="text-xs text-destructive">{errors.flexiEmail}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="flexi-password">Flexi jelszó</Label>
            <Input
              id="flexi-password"
              type="password"
              value={flexiPassword}
              onChange={(e) => setFlexiPassword(e.target.value)}
              disabled={loading}
              maxLength={128}
              className={errors.flexiPassword ? "border-destructive" : ""}
            />
            {errors.flexiPassword && <p className="text-xs text-destructive">{errors.flexiPassword}</p>}
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
      </DialogContent>
    </Dialog>
  );
};

export default FlexiConnectDialog;
