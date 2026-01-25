import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  ArrowRight,
  Save,
  Loader2,
  Calendar,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  TreatmentRule, 
  RuleVisit, 
  RuleItem,
  ScalingType,
  TargetToothType,
  SCALING_OPTIONS, 
  TARGET_TOOTH_OPTIONS, 
  CATEGORY_OPTIONS,
  DEFAULT_RULE_ITEM,
  DEFAULT_RULE_VISIT,
} from '@/types/treatmentRules';

interface SzotarKezelesOption {
  id: string;
  name: string;
  category: string | null;
}

interface TreatmentRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  rule?: TreatmentRule | null;
  onSave: () => void;
}

export function TreatmentRuleEditor({
  open,
  onOpenChange,
  clinicId,
  rule,
  onSave,
}: TreatmentRuleEditorProps) {
  const isEditing = !!rule?.id;
  
  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [semanticDescription, setSemanticDescription] = useState('');
  const [visits, setVisits] = useState<RuleVisit[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ visitIndex: number; itemIndex: number } | null>(null);
  
  // Szotar kezelesek for autocomplete
  const [szotarKezelesek, setSzotarKezelesek] = useState<SzotarKezelesOption[]>([]);
  const [activeAutocomplete, setActiveAutocomplete] = useState<{ visitIndex: number; itemIndex: number } | null>(null);

  // Fetch szotar_kezelesek when dialog opens
  useEffect(() => {
    if (open && clinicId) {
      const fetchSzotarKezelesek = async () => {
        const { data, error } = await supabase
          .from('szotar_kezelesek')
          .select('id, name, category')
          .eq('telephely_id', clinicId)
          .order('name', { ascending: true });
        
        if (!error && data) {
          setSzotarKezelesek(data);
        }
      };
      fetchSzotarKezelesek();
    }
  }, [open, clinicId]);

  // Initialize form when rule changes
  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setCategory(rule.category || '');
      setSemanticDescription(rule.semantic_description || '');
      setVisits(rule.visits || []);
    } else {
      // New rule - reset form
      setName('');
      setCategory('');
      setSemanticDescription('');
      setVisits([]);
    }
  }, [rule, open]);

  // Renumber visits
  const renumberVisits = useCallback((visitsToRenumber: RuleVisit[]): RuleVisit[] => {
    return visitsToRenumber.map((v, i) => ({ 
      ...v, 
      visit_number: i + 1,
      display_order: i 
    }));
  }, []);

  // Add new visit
  const addVisit = () => {
    setVisits(prev => renumberVisits([
      ...prev, 
      { 
        ...DEFAULT_RULE_VISIT,
        visit_number: prev.length + 1, 
        display_order: prev.length,
        items: [] 
      }
    ]));
  };

  // Remove visit
  const removeVisit = (visitIndex: number) => {
    setVisits(prev => renumberVisits(prev.filter((_, i) => i !== visitIndex)));
  };

  // Move visit up/down
  const moveVisit = (visitIndex: number, direction: 'up' | 'down') => {
    setVisits(prev => {
      const newVisits = [...prev];
      const targetIndex = direction === 'up' ? visitIndex - 1 : visitIndex + 1;
      if (targetIndex < 0 || targetIndex >= newVisits.length) return prev;
      [newVisits[visitIndex], newVisits[targetIndex]] = [newVisits[targetIndex], newVisits[visitIndex]];
      return renumberVisits(newVisits);
    });
  };

  // Update visit properties
  const updateVisit = (visitIndex: number, field: 'duration_days' | 'healing_months', value: number) => {
    setVisits(prev => prev.map((v, i) => 
      i === visitIndex ? { ...v, [field]: value } : v
    ));
  };

  // Move item within a visit
  const moveItem = (visitIndex: number, itemIndex: number, direction: 'up' | 'down') => {
    setVisits(prev => prev.map((visit, vi) => {
      if (vi !== visitIndex) return visit;
      const newItems = [...visit.items];
      const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
      if (targetIndex < 0 || targetIndex >= newItems.length) return visit;
      [newItems[itemIndex], newItems[targetIndex]] = [newItems[targetIndex], newItems[itemIndex]];
      return { ...visit, items: newItems.map((item, i) => ({ ...item, display_order: i })) };
    }));
  };

  // Move item to another visit
  const moveItemToVisit = (fromVisitIndex: number, itemIndex: number, toVisitIndex: number) => {
    setVisits(prev => {
      const newVisits = [...prev];
      const item = newVisits[fromVisitIndex].items[itemIndex];
      newVisits[fromVisitIndex] = {
        ...newVisits[fromVisitIndex],
        items: newVisits[fromVisitIndex].items.filter((_, i) => i !== itemIndex).map((it, i) => ({ ...it, display_order: i }))
      };
      newVisits[toVisitIndex] = {
        ...newVisits[toVisitIndex],
        items: [...newVisits[toVisitIndex].items, { ...item, display_order: newVisits[toVisitIndex].items.length }]
      };
      return newVisits;
    });
  };

  // Update item
  const updateItem = (visitIndex: number, itemIndex: number, field: keyof RuleItem, value: string | number) => {
    setVisits(prev => prev.map((visit, vi) => {
      if (vi !== visitIndex) return visit;
      return {
        ...visit,
        items: visit.items.map((item, ii) => 
          ii === itemIndex ? { ...item, [field]: value } : item
        )
      };
    }));
  };

  // Remove item
  const removeItem = (visitIndex: number, itemIndex: number) => {
    setVisits(prev => prev.map((visit, vi) => {
      if (vi !== visitIndex) return visit;
      return { 
        ...visit, 
        items: visit.items.filter((_, i) => i !== itemIndex).map((it, i) => ({ ...it, display_order: i }))
      };
    }));
  };

  // Add new item to visit
  const addItem = (visitIndex: number) => {
    setVisits(prev => prev.map((visit, vi) => {
      if (vi !== visitIndex) return visit;
      return { 
        ...visit, 
        items: [...visit.items, { ...DEFAULT_RULE_ITEM, display_order: visit.items.length }] 
      };
    }));
  };

  // Drag and drop handlers
  const handleDragStart = (visitIndex: number, itemIndex: number) => {
    setDraggedItem({ visitIndex, itemIndex });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetVisitIndex: number, targetItemIndex?: number) => {
    if (!draggedItem) return;
    
    const { visitIndex: fromVisitIndex, itemIndex: fromItemIndex } = draggedItem;
    
    if (fromVisitIndex === targetVisitIndex) {
      if (targetItemIndex !== undefined && targetItemIndex !== fromItemIndex) {
        setVisits(prev => prev.map((visit, vi) => {
          if (vi !== targetVisitIndex) return visit;
          const newItems = [...visit.items];
          const [removed] = newItems.splice(fromItemIndex, 1);
          newItems.splice(targetItemIndex, 0, removed);
          return { ...visit, items: newItems.map((it, i) => ({ ...it, display_order: i })) };
        }));
      }
    } else {
      moveItemToVisit(fromVisitIndex, fromItemIndex, targetVisitIndex);
    }
    
    setDraggedItem(null);
  };

  // Save changes
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Kérjük adja meg a szabály nevét');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && rule?.id) {
        // Update existing rule
        const { error: ruleError } = await supabase
          .from('treatment_rules')
          .update({
            name: name.trim(),
            category: category || null,
            semantic_description: semanticDescription.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

        if (ruleError) throw ruleError;

        // Delete existing visits and items (cascade will handle items)
        await supabase.from('rule_visits').delete().eq('rule_id', rule.id);

        // Insert new visits and items
        for (const visit of renumberVisits(visits)) {
          const { data: visitData, error: visitError } = await supabase
            .from('rule_visits')
            .insert({
              rule_id: rule.id,
              visit_number: visit.visit_number,
              duration_days: visit.duration_days,
              healing_months: visit.healing_months,
              display_order: visit.display_order,
            })
            .select('id')
            .single();

          if (visitError) throw visitError;

          if (visit.items.length > 0 && visitData) {
            const itemsToInsert = visit.items.map((item, i) => ({
              visit_id: visitData.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              scaling: item.scaling,
              target_tooth_type: item.target_tooth_type,
              display_order: i,
            }));

            const { error: itemsError } = await supabase
              .from('rule_items')
              .insert(itemsToInsert);

            if (itemsError) throw itemsError;
          }
        }

        toast.success('Szabály sikeresen frissítve');
      } else {
        // Create new rule
        const { data: ruleData, error: ruleError } = await supabase
          .from('treatment_rules')
          .insert({
            clinic_id: clinicId,
            name: name.trim(),
            category: category || null,
            semantic_description: semanticDescription.trim() || null,
          })
          .select('id')
          .single();

        if (ruleError) throw ruleError;

        // Insert visits and items
        for (const visit of renumberVisits(visits)) {
          const { data: visitData, error: visitError } = await supabase
            .from('rule_visits')
            .insert({
              rule_id: ruleData.id,
              visit_number: visit.visit_number,
              duration_days: visit.duration_days,
              healing_months: visit.healing_months,
              display_order: visit.display_order,
            })
            .select('id')
            .single();

          if (visitError) throw visitError;

          if (visit.items.length > 0 && visitData) {
            const itemsToInsert = visit.items.map((item, i) => ({
              visit_id: visitData.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              scaling: item.scaling,
              target_tooth_type: item.target_tooth_type,
              display_order: i,
            }));

            const { error: itemsError } = await supabase
              .from('rule_items')
              .insert(itemsToInsert);

            if (itemsError) throw itemsError;
          }
        }

        toast.success('Szabály sikeresen létrehozva');
      }

      onSave();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving rule:', err);
      toast.error('Hiba a mentéskor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle>
            {isEditing ? 'Szabály szerkesztése' : 'Új kezelési szabály'}
          </DialogTitle>
          <DialogDescription>
            Adja meg a szabály adatait és a hozzá tartozó viziteket
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-6">
            {/* Rule header section */}
            <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Szabály adatai</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rule-name">Szabály neve *</Label>
                    <Input
                      id="rule-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="pl. Cirkónia híd"
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rule-category">Kategória</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="rule-category" className="h-10">
                        <SelectValue placeholder="Válasszon kategóriát..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Szemantikus leírás</Label>
                  <Textarea
                    value={semanticDescription}
                    onChange={(e) => setSemanticDescription(e.target.value)}
                    placeholder="AI által generált leírás a kezelésről (szinonimák, típusok, stb.)"
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ez a leírás segít az AI-nak felismerni a kezelést különböző megfogalmazásokból
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Visits section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Vizitek</h3>
              
              {visits.map((visit, visitIndex) => (
                <Card 
                  key={visitIndex}
                  className={cn(
                    "transition-all duration-200",
                    draggedItem?.visitIndex !== visitIndex && "hover:border-primary/50"
                  )}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(visitIndex)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {visit.visit_number}. vizit
                        </CardTitle>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveVisit(visitIndex, 'up')}
                            disabled={visitIndex === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => moveVisit(visitIndex, 'down')}
                            disabled={visitIndex === visits.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            placeholder="0"
                            className="w-16 h-8"
                            value={visit.duration_days || ''}
                            onChange={(e) => updateVisit(visitIndex, 'duration_days', parseInt(e.target.value) || 0)}
                          />
                          <span className="text-sm text-muted-foreground">nap</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            placeholder="0"
                            className="w-16 h-8"
                            value={visit.healing_months || ''}
                            onChange={(e) => updateVisit(visitIndex, 'healing_months', parseInt(e.target.value) || 0)}
                          />
                          <span className="text-sm text-muted-foreground">hó gyógyulás</span>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeVisit(visitIndex)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-2">
                    <div className="space-y-2">
                      {/* Table header for items */}
                      {visit.items.length > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground border-b">
                          <div className="w-6" /> {/* Drag handle space */}
                          <div className="flex-1">Tétel neve</div>
                          <div className="w-14 text-center">Menny.</div>
                          <div className="w-16 text-center">Egység</div>
                          <div className="w-28 text-center">Skálázás</div>
                          <div className="w-28 text-center">Célzott fog</div>
                          <div className="w-24" /> {/* Actions space */}
                        </div>
                      )}
                      
                      {visit.items.map((item, itemIndex) => (
                        <div
                          key={itemIndex}
                          draggable
                          onDragStart={() => handleDragStart(visitIndex, itemIndex)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => {
                            e.stopPropagation();
                            handleDrop(visitIndex, itemIndex);
                          }}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-md border bg-background transition-all duration-150",
                            draggedItem?.visitIndex === visitIndex && draggedItem?.itemIndex === itemIndex
                              ? "opacity-50 border-primary"
                              : "hover:border-primary/50"
                          )}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab flex-shrink-0" />
                          
                          {/* Tétel neve with autocomplete */}
                          <div className="flex-1 relative">
                            <Input
                              value={item.name}
                              onChange={(e) => {
                                updateItem(visitIndex, itemIndex, 'name', e.target.value);
                                setActiveAutocomplete({ visitIndex, itemIndex });
                              }}
                              onFocus={() => setActiveAutocomplete({ visitIndex, itemIndex })}
                              onBlur={() => {
                                // Delay to allow click on suggestion
                                setTimeout(() => setActiveAutocomplete(null), 200);
                              }}
                              placeholder="Tétel neve"
                              className="h-8"
                            />
                            {/* Autocomplete dropdown */}
                            {activeAutocomplete?.visitIndex === visitIndex && 
                             activeAutocomplete?.itemIndex === itemIndex && 
                             item.name.length > 0 && (
                              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                                {szotarKezelesek
                                  .filter(k => k.name.toLowerCase().includes(item.name.toLowerCase()))
                                  .slice(0, 10)
                                  .map((kezeles) => (
                                    <div
                                      key={kezeles.id}
                                      className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex justify-between items-center"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        updateItem(visitIndex, itemIndex, 'name', kezeles.name);
                                        setActiveAutocomplete(null);
                                      }}
                                    >
                                      <span>{kezeles.name}</span>
                                      {kezeles.category && (
                                        <span className="text-xs text-muted-foreground ml-2">{kezeles.category}</span>
                                      )}
                                    </div>
                                  ))}
                                {szotarKezelesek.filter(k => k.name.toLowerCase().includes(item.name.toLowerCase())).length === 0 && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground">
                                    Nincs találat
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {item.scaling === 'per_case' && (
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(visitIndex, itemIndex, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-14 h-8 text-center"
                              min={1}
                            />
                          )}
                          
                          <Select 
                            value={item.scaling} 
                            onValueChange={(v) => updateItem(visitIndex, itemIndex, 'scaling', v as ScalingType)}
                          >
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCALING_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select 
                            value={item.target_tooth_type} 
                            onValueChange={(v) => updateItem(visitIndex, itemIndex, 'target_tooth_type', v as TargetToothType)}
                          >
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TARGET_TOOTH_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveItem(visitIndex, itemIndex, 'up')}
                              disabled={itemIndex === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => moveItem(visitIndex, itemIndex, 'down')}
                              disabled={itemIndex === visit.items.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            
                            {visits.length > 1 && (
                              <div className="relative group">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Áthelyezés másik vizitbe"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </Button>
                                <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 bg-popover border rounded-md shadow-lg p-1 min-w-[100px]">
                                  {visits.map((_, vi) => (
                                    vi !== visitIndex && (
                                      <button
                                        key={vi}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-sm"
                                        onClick={() => moveItemToVisit(visitIndex, itemIndex, vi)}
                                      >
                                        {vi + 1}. vizit
                                      </button>
                                    )
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeItem(visitIndex, itemIndex)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => addItem(visitIndex)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Új tétel hozzáadása
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Button
                variant="outline"
                className="w-full"
                onClick={addVisit}
              >
                <Plus className="h-4 w-4 mr-2" />
                Új vizit hozzáadása
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Mégse
          </Button>
          <GalaxyButton onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Mentés...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Mentés
              </>
            )}
          </GalaxyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
