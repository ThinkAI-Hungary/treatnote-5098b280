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

interface ProbaPaciensDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  currentName: string | null;
  onSaved: (name: string) => void;
}

export function ProbaPaciensDialog({
  open,
  onOpenChange,
  telephelyId,
  currentName,
  onSaved,
}: ProbaPaciensDialogProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName || '');
    }
  }, [open, currentName]);

  const handleSave = async () => {
    if (!telephelyId) {
      toast.error('Nincs kiválasztva telephely');
      return;
    }

    if (!name.trim()) {
      toast.error('Kérem adja meg a próbapáciens nevét');
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from('telephely')
        .update({ probapaciens_neve: name.trim() })
        .eq('id', telephelyId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Nincs jogosultsága a módosításhoz');

      toast.success('Próbapáciens neve sikeresen mentve');
      onSaved(name.trim());
      notifyTelephelyDataChanged();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving probapaciens:', err);
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
            Próba ID beállítása
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>
                    A létrehozott próbapáciensen fog a rendszer különböző kezelési adatokhoz jutni,
                    illetve próbafutásokat végezni. Kérem hozzon létre egy olyan felhasználót,
                    amely neve egyértelműen jelzi a teszt jelleget, és annak ID-ját illessze be a lenti mezőbe
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DialogTitle>
          <DialogDescription>
            Adja meg a próba páciens ID-ját a tesztek futtatásához
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="probapaciens-name">Próba páciens ID-ja</Label>
            <Input
              id="probapaciens-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="Pl.: 12345678"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mentés
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
