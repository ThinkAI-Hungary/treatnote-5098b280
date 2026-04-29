import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
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
import { Loader2 } from 'lucide-react';
import { GalaxyButton } from './GalaxyButton';

const PREDEFINED_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ef4444', // red
  '#f97316', // orange
  '#22c55e', // green
  '#06b6d4', // cyan
  '#f43f5e', // rose
  '#10b981', // emerald
  '#eab308', // yellow
  '#64748b', // slate
];

interface CustomCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string;
  mode?: 'nativ' | 'flexi';
  onSaved: (newCategoryName: string) => void;
}

export function CustomCategoryDialog({
  open,
  onOpenChange,
  telephelyId,
  mode = 'nativ',
  onSaved
}: CustomCategoryDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PREDEFINED_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Kérjük adja meg a kategória nevét!');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('clinic_custom_categories')
        .insert({
          telephely_id: telephelyId,
          mode,
          name: name.trim(),
          color,
          icon: 'filled_dot' // Default icon
        });

      if (error) throw error;

      toast.success('Kategória sikeresen létrehozva!');
      onSaved(name.trim());
      onOpenChange(false);
      setName('');
      setColor(PREDEFINED_COLORS[0]);
    } catch (err: any) {
      console.error('Error saving custom category:', err);
      toast.error('Hiba történt a mentés során: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Új kategória hozzáadása</DialogTitle>
          <DialogDescription>
            Hozzon létre egy saját kategóriát, amely elérhető lesz a kezelési tervek és szabályok szerkesztésénél is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Kategória neve *</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="pl. Fogfehérítés Extra"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Szín megjelölés</Label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                    color === c ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Mégse
          </Button>
          <GalaxyButton onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Létrehozás
          </GalaxyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
