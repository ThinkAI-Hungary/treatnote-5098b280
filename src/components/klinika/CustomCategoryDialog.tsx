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
import { cn } from '@/lib/utils';

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
            <div className="flex flex-wrap items-center gap-2">
              <div 
                className={cn(
                  "relative w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 cursor-pointer",
                  !PREDEFINED_COLORS.includes(color) ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:scale-105 shadow-sm'
                )}
                title="Egyéni szín választása" 
              >
                <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff00ff, #ff0000)' }} />
                <div className="absolute inset-[2px] rounded-full bg-background flex items-center justify-center z-10 overflow-hidden">
                   {!PREDEFINED_COLORS.includes(color) && (
                     <div className="w-full h-full" style={{ backgroundColor: color }} />
                   )}
                </div>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-[-10px] w-[50px] h-[50px] opacity-0 cursor-pointer z-20"
                />
              </div>
              
              <div className="h-6 w-px bg-border mx-1" />

              {PREDEFINED_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0",
                    color === c ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
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
