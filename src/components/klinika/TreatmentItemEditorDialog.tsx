import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import { classifyTreatmentItem, TREATMENT_CATEGORIES, type TreatmentVisualCue } from '@/lib/treatmentClassifier';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { VisualCueChip } from './VisualCueChip';
import type { CombinedTreatmentItem } from '@/lib/treatmentItems';

interface TreatmentItemEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string;
  editingItem?: CombinedTreatmentItem | null;
  onSaved: (item?: any) => void;
  availableCategories: string[];
}

export function TreatmentItemEditorDialog({
  open,
  onOpenChange,
  telephelyId,
  editingItem,
  onSaved,
  availableCategories,
}: TreatmentItemEditorDialogProps) {
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formIsPerTooth, setFormIsPerTooth] = useState(true);
  const [formVisualCue, setFormVisualCue] = useState<TreatmentVisualCue | null>(null);
  
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryDialogOpen, setCustomCategoryDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setFormName(editingItem.name);
        setFormCategory(editingItem.category);
        setFormPrice(editingItem.price?.toString() || '');
        setFormIsPerTooth(editingItem.is_per_tooth);
        setFormVisualCue({
          visual_group: editingItem.visual_group,
          visual_color: editingItem.visual_color,
          visual_icon: editingItem.visual_icon,
          label: editingItem.category,
        });
        setIsCustomCategory(!TREATMENT_CATEGORIES.includes(editingItem.category as any) && !availableCategories.includes(editingItem.category));
      } else {
        setFormName('');
        setFormCategory('');
        setFormPrice('');
        setFormIsPerTooth(true);
        setFormVisualCue(null);
        setIsCustomCategory(false);
      }
    }
  }, [open, editingItem, availableCategories]);

  const handleNameChange = (val: string) => {
    setFormName(val);
    if (val.length > 2) {
      setFormVisualCue(classifyTreatmentItem(val, formCategory));
    }
  };

  const handleCategoryChange = (val: string) => {
    setFormCategory(val);
    if (formName.length > 2) {
      setFormVisualCue(classifyTreatmentItem(formName, val));
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('A név megadása kötelező'); return; }
    if (!formCategory.trim()) { toast.error('A kategória megadása kötelező'); return; }

    const cue = formVisualCue || classifyTreatmentItem(formName, formCategory);
    setSaving(true);

    try {
      const payload: any = {
        telephely_id: telephelyId,
        name: formName.trim(),
        category: formCategory.trim(),
        subcategory: null,
        price: formPrice ? parseInt(formPrice, 10) : null,
        is_per_tooth: formIsPerTooth,
        visual_group: cue.visual_group,
        visual_color: cue.visual_color,
        visual_icon: cue.visual_icon,
        updated_at: new Date().toISOString(),
      };

      let savedItem = null;
      const isNameChanged = editingItem ? editingItem.name !== formName.trim() : true;

      if (editingItem?.is_default) {
        const { data, error } = await supabase
          .from('clinic_item_overrides')
          .upsert({
            telephely_id: telephelyId,
            default_item_id: editingItem.id,
            price: payload.price,
            is_active: editingItem.is_active,
          }, { onConflict: 'telephely_id,default_item_id' })
          .select()
          .single();
        if (error) throw error;
        toast.success('Alapértelmezett tétel ára frissítve');
        savedItem = data;
      } else if (editingItem) {
        // If name changed, set embedding_status to pending
        if (isNameChanged) {
          payload.embedding_status = 'pending';
        }
        
        const { data, error } = await supabase
          .from('clinic_treatment_items_stdl' as any)
          .update(payload)
          .eq('id', editingItem.id)
          .select()
          .single();
        if (error) throw error;
        toast.success('Tétel frissítve');
        savedItem = data;
      } else {
        // New item always gets pending status (default in DB, but explicitly here too)
        payload.embedding_status = 'pending';
        const { data, error } = await supabase
          .from('clinic_treatment_items_stdl' as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        toast.success('Új tétel létrehozva');
        savedItem = data;
      }

      onSaved(savedItem);

      // Handle embedding generation for non-default items if name changed or it's new
      if (!editingItem?.is_default && isNameChanged && savedItem?.id) {
        let affectedRuleIds: string[] = [];

        // If it's an existing item, find active rules that use it
        if (editingItem) {
          const { data: rules } = await supabase
            .from('treatment_rules_stdl')
            .select(`
              id, 
              visits:rule_visits_stdl(
                items:rule_items_stdl(item_id)
              )
            `)
            .eq('clinic_id', telephelyId)
            .eq('aktiv', true);

          if (rules) {
            for (const rule of rules) {
              let hasItem = false;
              if (Array.isArray(rule.visits)) {
                for (const visit of rule.visits) {
                  if (Array.isArray(visit.items) && visit.items.some((ri: any) => ri.item_id === savedItem.id)) {
                    hasItem = true;
                    break;
                  }
                }
              }
              if (hasItem) affectedRuleIds.push(rule.id);
            }
          }

          // Deactivate affected rules
          if (affectedRuleIds.length > 0) {
            await supabase
              .from('treatment_rules_stdl')
              .update({ aktiv: false })
              .in('id', affectedRuleIds);
            
            toast.warning(`Figyelem: A tétel átnevezése miatt ${affectedRuleIds.length} aktív szabály átmenetileg inaktiválásra került az AI kereső frissítéséig.`);
          }
        }

        // Trigger the edge function
        supabase.functions.invoke('regenerate-item-embedding', {
          body: { 
            item_id: savedItem.id, 
            rule_ids_to_reactivate: affectedRuleIds 
          }
        }).catch(console.error);
      }

    } catch (err: any) {
      console.error('Error saving item:', err);
      if (err.message?.includes('unique') || err.code === '23505') {
        toast.error('Ilyen nevű tétel már létezik');
      } else {
        toast.error('Hiba a mentéskor: ' + (err.message || ''));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Tétel szerkesztése' : 'Új kezelési tétel'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Megnevezés *</Label>
              <Input 
                value={formName} 
                onChange={e => handleNameChange(e.target.value)} 
                placeholder="pl. Kompozit tömés (2 felszín)" 
                disabled={editingItem?.is_default}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Kategória *</Label>
              {isCustomCategory ? (
                <Input
                  placeholder="Új kategória..."
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  onBlur={() => { if (!formCategory) setIsCustomCategory(false) }}
                  autoFocus
                  disabled={editingItem?.is_default}
                />
              ) : (
                <Select value={formCategory} onValueChange={(val) => {
                  if (val === 'custom') {
                    setCustomCategoryDialogOpen(true);
                  } else {
                    handleCategoryChange(val);
                  }
                }} disabled={editingItem?.is_default}>
                  <SelectTrigger><SelectValue placeholder="Válasszon..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom" className="text-primary font-bold bg-primary/5 mb-1 sticky top-0 z-10 backdrop-blur-md">+ Új kategória...</SelectItem>
                    {availableCategories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ár (Ft)</Label>
                <Input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="pl. 25000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Típus</Label>
                <div className="flex items-center gap-2 h-9 px-3 border rounded-md">
                  <Switch checked={formIsPerTooth} onCheckedChange={setFormIsPerTooth} />
                  <span className="text-sm">{formIsPerTooth ? 'Fog' : 'Szájüreg/Esetenkénti'}</span>
                </div>
              </div>
            </div>

            {/* Visual cue preview */}
            {formVisualCue && (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <span className="text-xs text-muted-foreground">Vizuális jelzés:</span>
                <VisualCueChip color={formVisualCue.visual_color} label={formVisualCue.label} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {editingItem ? 'Mentés' : 'Létrehozás'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomCategoryDialog
        open={customCategoryDialogOpen}
        onOpenChange={setCustomCategoryDialogOpen}
        telephelyId={telephelyId || ''}
        mode="nativ"
        onSaved={(newCategoryName) => {
          setFormCategory(newCategoryName);
        }}
      />
    </>
  );
}
