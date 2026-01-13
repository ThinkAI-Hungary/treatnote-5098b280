import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Info, Loader2 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { notifyTelephelyDataChanged } from '@/lib/telephelyEvents';

interface DomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  currentDomain: string | null;
  onSaved: (domain: string) => void;
}

export function DomainDialog({
  open,
  onOpenChange,
  telephelyId,
  currentDomain,
  onSaved,
}: DomainDialogProps) {
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDomain(currentDomain || '');
    }
  }, [open, currentDomain]);

  const handleSave = async () => {
    if (!telephelyId) {
      toast.error('Nincs kiválasztva telephely');
      return;
    }

    if (!domain.trim()) {
      toast.error('Kérem adja meg a domain nevét');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('telephely')
        .update({ flexi_domain: domain.trim() })
        .eq('id', telephelyId);

      if (error) throw error;

      toast.success('Domain sikeresen mentve');
      onSaved(domain.trim());
      notifyTelephelyDataChanged();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving domain:', err);
      toast.error('Hiba a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Domain beállítása
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>
                    Kérem adja meg azt az URL-t, amelyen Ön és a klinika többi felhasználója 
                    bejelentkezik a Flexi-Dent fiókjába. Az URL kinézete:{' '}
                    <span className="inline-block">
                      "https://
                      <span className="text-primary font-medium animate-[pulse_10s_ease-in-out_infinite]">AZ ÖN DOMAINJE</span>
                      .flexi-dent.hu/"
                    </span>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription>
            Adja meg a klinika FlexiDent domain nevét
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="domain-name">Domain neve</Label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">https://</span>
              <Input
                id="domain-name"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="klinika-neve"
                autoComplete="off"
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">.flexi-dent.hu</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !domain.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mentés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
