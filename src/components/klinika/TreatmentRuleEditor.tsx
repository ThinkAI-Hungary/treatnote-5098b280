import { useState, useCallback, useEffect, useMemo, useRef, Fragment } from 'react';
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
  Clock,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { toast } from '@/hooks/useToastMessage';
import { supabase } from '@/integrations/supabase/client';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { TreatmentItemEditorDialog } from './TreatmentItemEditorDialog';
import { fetchCombinedTreatmentItems } from '@/lib/treatmentItems';
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
  visual_color?: string;
  id: string;
  name: string;
  category: string | null;
}

interface TreatmentRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  rule?: TreatmentRule | null;
  originalRuleIdToDeactivate?: string | null;
  onSave: (rule?: TreatmentRule) => void;
  availableCategories?: string[];
  mode?: 'flexi' | 'native';
}

export function TreatmentRuleEditor({
  open,
  onOpenChange,
  clinicId,
  rule,
  originalRuleIdToDeactivate,
  onSave,
  availableCategories = CATEGORY_OPTIONS,
  mode = 'flexi',
}: TreatmentRuleEditorProps) {
  const isEditing = !!rule?.id;

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryDialogOpen, setCustomCategoryDialogOpen] = useState(false);
  const [localCustomCategories, setLocalCustomCategories] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [semanticDescription, setSemanticDescription] = useState('');
  const [visits, setVisits] = useState<RuleVisit[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ visitIndex: number; itemIndex: number } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ visitIndex: number; itemIndex?: number; direction?: 'top' | 'bottom' } | null>(null);
  const [dragOffset, setDragOffset] = useState({ y: 0, height: 0 });

  // Szotar kezelesek for autocomplete
  const [szotarKezelesek, setSzotarKezelesek] = useState<SzotarKezelesOption[]>([]);
  const [activeAutocomplete, setActiveAutocomplete] = useState<{ visitIndex: number; itemIndex: number } | null>(null);

  const [newItemDialogOpen, setNewItemDialogOpen] = useState(false);
  const [creatingItemFor, setCreatingItemFor] = useState<{visitIndex: number, itemIndex: number} | null>(null);

  const fetchSzotarKezelesek = useCallback(async () => {
    if (!clinicId) return;
    if (mode === 'native') {
      try {
        const data = await fetchCombinedTreatmentItems(clinicId);
        const activeItems = data
          .filter(item => item.is_active)
          .sort((a, b) => a.name.localeCompare(b.name, 'hu'));
        setSzotarKezelesek(activeItems as any[]);
      } catch (error) {
        console.error('Failed to fetch szotar items:', error);
      }
    } else {
      const { data, error } = await supabase
        .from('szotar_kezelesek')
        .select('id, name, category')
        .eq('telephely_id', clinicId)
        .order('name', { ascending: true });

      if (!error && data) {
        setSzotarKezelesek(data);
      }
    }
  }, [clinicId, mode]);

  // Fetch szotar_kezelesek when dialog opens
  useEffect(() => {
    if (open) {
      fetchSzotarKezelesek();
    }
  }, [open, fetchSzotarKezelesek]);

  // Global capture to aggressively prevent crossed-out cursor anywhere on the screen
  useEffect(() => {
    if (!draggedItem) return;

    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault(); // Prevents the cross-out cursor natively
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    };

    // Use capture phase to intercept before anything else can mess it up
    document.addEventListener('dragover', handleGlobalDragOver, { capture: true });
    document.addEventListener('dragenter', handleGlobalDragOver, { capture: true });

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, { capture: true });
      document.removeEventListener('dragenter', handleGlobalDragOver, { capture: true });
    };
  }, [draggedItem]);

  // Initialize form when rule changes
  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setCategory(rule.category || '');
      setIsCustomCategory(rule.category ? !CATEGORY_OPTIONS.includes(rule.category as any) : false);
      setDescription(rule.semantic_description || '');
      setSemanticDescription(rule.semantic_description || '');
      setVisits(rule.visits || []);
    } else {
      // New rule - reset form
      setName('');
      setCategory('');
      setIsCustomCategory(false);
      setDescription('');
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
  const handleDragStart = (e: React.DragEvent, visitIndex: number, itemIndex: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      y: e.clientY - rect.top,
      height: rect.height
    });
    setDraggedItem({ visitIndex, itemIndex });
    // setTimeout allows the browser to capture the native drag image before the DOM hides the element
    setTimeout(() => {
      setDragOverTarget({ visitIndex, itemIndex, direction: 'top' });
    }, 0);
  };

  const handleItemDragOver = (e: React.DragEvent, visitIndex: number, itemIndex: number) => {
    e.preventDefault();
    e.stopPropagation(); // VERY IMPORTANT: stop CardContent from catching this
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItem) return;

    // INERT: If we are hovering over the original dragged item itself, do NOT trigger any action point calculations!
    // Just maintain the state.
    if (draggedItem.visitIndex === visitIndex && draggedItem.itemIndex === itemIndex) {
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    
    // "Action point" of the dragged item: its visual center on the screen
    const draggedCenterY = e.clientY - dragOffset.y + dragOffset.height / 2;
    // "Action point" of the target item: its visual center
    const targetCenterY = rect.top + rect.height / 2;
    
    const direction = draggedCenterY < targetCenterY ? 'top' : 'bottom';
    
    setDragOverTarget(prev => {
      if (prev?.visitIndex === visitIndex && prev?.itemIndex === itemIndex && prev?.direction === direction) {
        return prev;
      }
      return { visitIndex, itemIndex, direction };
    });
  };

  const handleVisitDragOver = (e: React.DragEvent, visitIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedItem) return;
    
    // If we hover over the empty space/padding of the card content,
    const lastIndex = visits[visitIndex].items.length - 1;
    if (lastIndex >= 0) {
      setDragOverTarget(prev => {
        // INERT PADDING: If we are already targeting this visit, don't jump to the bottom!
        // This prevents violent flickering when the mouse accidentally hits the left/right padding of the card.
        if (prev?.visitIndex === visitIndex) return prev;
        
        return { visitIndex, itemIndex: lastIndex, direction: 'bottom' };
      });
    } else {
      // Empty visit
      setDragOverTarget(prev => {
        if (prev?.visitIndex === visitIndex && prev?.itemIndex === undefined) return prev;
        return { visitIndex };
      });
    }
  };

  const commitDrag = () => {
    if (!draggedItem || !dragOverTarget) {
      setDraggedItem(null);
      setDragOverTarget(null);
      return;
    }

    const { visitIndex: fromVisitIndex, itemIndex: fromItemIndex } = draggedItem;
    const { visitIndex: toVisitIndex, itemIndex: toItemIndex, direction } = dragOverTarget;

    setVisits(prev => {
      const newVisits = [...prev];
      const item = newVisits[fromVisitIndex].items[fromItemIndex];

      if (fromVisitIndex === toVisitIndex) {
        if (toItemIndex !== undefined && toItemIndex !== fromItemIndex) {
          const newItems = [...newVisits[toVisitIndex].items];
          newItems.splice(fromItemIndex, 1);
          
          let insertIndex = toItemIndex;
          if (fromItemIndex < toItemIndex && direction === 'top') {
             insertIndex -= 1;
          } else if (fromItemIndex > toItemIndex && direction === 'bottom') {
             insertIndex += 1;
          }

          newItems.splice(insertIndex, 0, item);
          newVisits[toVisitIndex] = {
            ...newVisits[toVisitIndex],
            items: newItems.map((it, i) => ({ ...it, display_order: i }))
          };
        }
      } else {
        newVisits[fromVisitIndex] = {
          ...newVisits[fromVisitIndex],
          items: newVisits[fromVisitIndex].items.filter((_, i) => i !== fromItemIndex).map((it, i) => ({ ...it, display_order: i }))
        };

        const targetItems = [...newVisits[toVisitIndex].items];
        if (toItemIndex !== undefined) {
          let insertIndex = direction === 'bottom' ? toItemIndex + 1 : toItemIndex;
          targetItems.splice(insertIndex, 0, item);
        } else {
          targetItems.push(item);
        }

        newVisits[toVisitIndex] = {
          ...newVisits[toVisitIndex],
          items: targetItems.map((it, i) => ({ ...it, display_order: i }))
        };
      }
      return newVisits;
    });

    setDraggedItem(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    commitDrag();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commitDrag();
  };

  // Regenerate embedding for a rule
  const regenerateEmbedding = async (ruleId: string) => {
    try {
      console.log('Regenerating embedding for rule:', ruleId);
      const { data, error } = await supabase.functions.invoke('regenerate-rule-embedding', {
        body: { rule_id: ruleId, mode: mode || 'flexi' },
      });

      if (error) {
        console.error('Embedding regeneration error:', error);
        toast.error('Embedding újragenerálás sikertelen');
        return;
      }

      if (data?.success) {
        toast.success(`Embedding frissítve (${data.embeddings_created} db)`);
      } else {
        console.warn('Embedding regeneration failed:', data?.error);
      }
    } catch (err) {
      console.error('Error regenerating embedding:', err);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Kérjük adja meg a szabály nevét');
      return;
    }

    setSaving(true);
    try {
      let savedRuleId: string | null = null;
      
      const isNative = mode === 'native';
      const rulesTable = isNative ? 'treatment_rules_stdl' : 'treatment_rules';
      const visitsTable = isNative ? 'rule_visits_stdl' : 'rule_visits';
      const itemsTable = isNative ? 'rule_items_stdl' : 'rule_items';

      if (isEditing && rule?.id) {
        savedRuleId = rule.id;

        // Update existing rule
        const { error: ruleError } = await supabase
          .from(rulesTable as any)
          .update({
            name: name.trim(),
            category: category || null,
            semantic_description: semanticDescription.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

        if (ruleError) throw ruleError;

        // Delete existing visits and items (cascade will handle items)
        await supabase.from(visitsTable as any).delete().eq('rule_id', rule.id);

        // Insert new visits and items
        for (const visit of renumberVisits(visits)) {
          const { data: visitData, error: visitError } = await supabase
            .from(visitsTable as any)
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
              item_id: item.item_id || null,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              scaling: item.scaling,
              target_tooth_type: item.target_tooth_type,
              display_order: i,
            }));

            const { error: itemsError } = await supabase
              .from(itemsTable as any)
              .insert(itemsToInsert);

            if (itemsError) throw itemsError;
          }
        }

        toast.success('Szabály sikeresen frissítve');
      } else {
        // Create new rule
        const { data: ruleData, error: ruleError } = await supabase
          .from(rulesTable as any)
          .insert({
            clinic_id: clinicId,
            name: name.trim(),
            category: category || null,
            semantic_description: semanticDescription.trim() || null,
          })
          .select('id')
          .single();

        if (ruleError) throw ruleError;

        savedRuleId = ruleData.id;

        // If this was an edit of an alapszabaly, deactivate the original
        if (originalRuleIdToDeactivate) {
          const { error: deactivateError } = await supabase
            .from(rulesTable as any)
            .update({ aktiv: false })
            .eq('id', originalRuleIdToDeactivate);

          if (deactivateError) {
            console.error('Error deactivating original rule:', deactivateError);
            toast.error('Az eredeti szabály inaktiválása sikertelen');
          } else {
            // Optional: notify success, or just let it happen silently
            // toast.success('Eredeti szabály inaktiválva');
          }
        }

        // Insert visits and items
        for (const visit of renumberVisits(visits)) {
          const { data: visitData, error: visitError } = await supabase
            .from(visitsTable as any)
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
              item_id: item.item_id || null,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              scaling: item.scaling,
              target_tooth_type: item.target_tooth_type,
              display_order: i,
            }));

            const { error: itemsError } = await supabase
              .from(itemsTable as any)
              .insert(itemsToInsert);

            if (itemsError) throw itemsError;
          }
        }

        toast.success('Szabály sikeresen létrehozva');
      }

      // Fetch the complete rule to update parent state without reload
      if (savedRuleId) {
        const { data: completeRule, error: fetchError } = await supabase
          .from(rulesTable as any)
          .select(`
            *,
            visits:${visitsTable}(
              *,
              items:${itemsTable}(*)
            )
          `)
          .eq('id', savedRuleId)
          .single();

        if (!fetchError && completeRule) {
          // Sort visits and items locally to ensure order
          const formattedRule = {
            ...completeRule,
            visits: (completeRule.visits || [])
              .sort((a: any, b: any) => a.display_order - b.display_order)
              .map((visit: any) => ({
                ...visit,
                items: (visit.items || [])
                  .sort((a: any, b: any) => a.display_order - b.display_order)
              }))
          } as TreatmentRule;

          onSave(formattedRule);
        } else {
          onSave(); // Fallback to reload
        }

        // Regenerate embedding in background
        regenerateEmbedding(savedRuleId);
      } else {
        onSave();
      }

      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving rule:', err);
      toast.error('Hiba a mentéskor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] flex flex-col p-0"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={handleDrop}
      >
        <DialogHeader className="flex-shrink-0 p-6 pb-4">
          <DialogTitle>
            {isEditing ? 'Szabály szerkesztése' : 'Új kezelési szabály'}
          </DialogTitle>
          <DialogDescription>
            Adja meg a szabály adatait és a hozzá tartozó viziteket
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-48 custom-scrollbar-purple">
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
                    {isCustomCategory ? (
                      <Input 
                        id="rule-category"
                        placeholder="Új kategória..."
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        onBlur={() => { if(!category) setIsCustomCategory(false) }}
                        className="h-10"
                        autoFocus
                      />
                    ) : (
                      <Select value={category} onValueChange={(val) => {
                        if (val === 'custom') {
                          setCustomCategoryDialogOpen(true);
                        } else {
                          setCategory(val);
                        }
                      }}>
                        <SelectTrigger id="rule-category" className="h-10">
                          <SelectValue placeholder="Válasszon kategóriát..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom" className="text-primary font-bold bg-primary/5 mb-1 sticky top-0 z-10 backdrop-blur-md">+ Új kategória...</SelectItem>
                          {Array.from(new Set([...availableCategories, ...localCustomCategories]))
                            .sort((a, b) => a.localeCompare(b, 'hu'))
                            .map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Szabály Vizitek Listája */}
            <div 
              className="space-y-4"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
            >
              <h3 className="text-sm font-medium text-muted-foreground">Vizitek</h3>

              {visits.map((visit, visitIndex) => (
                <Card
                  key={visitIndex}
                  className={cn(
                    "transition-all duration-200",
                    draggedItem?.visitIndex !== visitIndex && "hover:border-primary/50"
                  )}
                  onDragOver={(e) => handleVisitDragOver(e, visitIndex)}
                  onDrop={handleDrop}
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

                  <CardContent 
                    className="pt-2 min-h-[100px]"
                    onDragOver={(e) => handleVisitDragOver(e, visitIndex)}
                    onDrop={handleDrop}
                  >
                    <div 
                      className="relative flex flex-col gap-2 w-full"
                      onDragOver={(e) => {
                        // Prevent the gap between items from bubbling up to CardContent,
                        // which would otherwise cause the ghost to violently jump to the bottom!
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                    >
                      {/* Table header for items */}
                      {visit.items.length > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground border-b">
                          <div className="w-6" /> {/* Drag handle space */}
                          <div className="flex-1">Tétel neve</div>
                          <div className="w-14 text-center">Menny.</div>
                          <div className="w-28 text-center">Skálázás</div>
                          <div className="w-28 text-center">Célzott fog</div>
                          <div className="w-24" /> {/* Actions space */}
                        </div>
                      )}

                      {/* Ghost placeholder and mapping */}
                      {(() => {
                        const renderGhost = (targetVisitIndex: number, targetItemIndex?: number) => {
                          if (!draggedItem) return null;
                          const gItem = visits[draggedItem.visitIndex]?.items[draggedItem.itemIndex];
                          if (!gItem) return null;
                          
                          return (
                            <div 
                              className="flex items-center gap-2 p-2 rounded-md border-2 border-primary/40 bg-primary/5 opacity-80 animate-in fade-in zoom-in duration-150"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation(); // INERT: Deactivated action point. Just preserve current state.
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={handleDrop}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1">
                                <div className="h-8 rounded-md border border-input/50 bg-background/50 px-3 flex items-center text-sm text-foreground/80">{gItem.name || 'Új tétel...'}</div>
                              </div>
                              <div className="w-14 h-8 rounded-md border border-input/50 bg-background/50 flex items-center justify-center text-sm text-foreground/80">{gItem.quantity}</div>
                              <div className="w-28 h-8 rounded-md border border-input/50 bg-background/50 px-3 flex items-center text-sm text-foreground/80 truncate">
                                 {SCALING_OPTIONS.find(o => o.value === gItem.scaling)?.label || gItem.scaling}
                              </div>
                              <div className="w-28 h-8 rounded-md border border-input/50 bg-background/50 px-3 flex items-center text-sm text-foreground/80 truncate">
                                 {TARGET_TOOTH_OPTIONS.find(o => o.value === gItem.target_tooth_type)?.label || gItem.target_tooth_type}
                              </div>
                              <div className="w-24" /> {/* Actions space */}
                            </div>
                          );
                        };
                        
                        return (
                          <>
                            {dragOverTarget?.visitIndex === visitIndex && dragOverTarget.itemIndex === undefined && renderGhost(visitIndex)}
                            {visit.items.map((item, itemIndex) => {
                              const isDragOverTop = dragOverTarget?.visitIndex === visitIndex && dragOverTarget?.itemIndex === itemIndex && dragOverTarget.direction === 'top';
                              const isDragOverBottom = dragOverTarget?.visitIndex === visitIndex && dragOverTarget?.itemIndex === itemIndex && dragOverTarget.direction === 'bottom';
                              const isDraggedItem = draggedItem?.visitIndex === visitIndex && draggedItem?.itemIndex === itemIndex;
                              const shouldHideDragged = isDraggedItem && dragOverTarget !== null;

                              return (
                                <Fragment key={itemIndex}>
                                  {isDragOverTop && renderGhost(visitIndex, itemIndex)}
                                  <div
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, visitIndex, itemIndex)}
                                    onDragOver={(e) => handleItemDragOver(e, visitIndex, itemIndex)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={handleDrop}
                                    className={cn(
                                      "flex items-center gap-2 p-2 rounded-md border bg-background transition-all duration-150",
                                      !!draggedItem && "[&>*]:pointer-events-none",
                                      shouldHideDragged
                                        ? "absolute opacity-0 pointer-events-none -z-10 !my-0 w-full"
                                        : (isDraggedItem ? "opacity-50 border-primary" : "hover:border-primary/50")
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
                              activeAutocomplete?.itemIndex === itemIndex && (
                                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-primary/20 rounded-md shadow-lg flex flex-col max-h-[200px]">
                                  <div
                                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent text-primary font-bold bg-primary/5 border-b border-primary/10 shrink-0 z-10"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCreatingItemFor({ visitIndex, itemIndex });
                                      setNewItemDialogOpen(true);
                                      setActiveAutocomplete(null);
                                    }}
                                  >
                                    + Új tétel hozzáadása...
                                  </div>
                                  
                                  <div className="overflow-y-scroll overflow-x-hidden flex-1 custom-scrollbar-purple">
                                    {szotarKezelesek
                                      .filter(k => k.name.toLowerCase().includes(item.name.toLowerCase()))
                                      .map((kezeles) => (
                                        <div
                                          key={kezeles.id}
                                          className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground flex justify-between items-center"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            updateItem(visitIndex, itemIndex, 'name', kezeles.name);
                                            updateItem(visitIndex, itemIndex, 'item_id', kezeles.id);
                                            setActiveAutocomplete(null);
                                          }}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {mode === 'native' && kezeles.visual_color && (
                                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: kezeles.visual_color }} />
                                            )}
                                            <span className="truncate">{kezeles.name}</span>
                                          </div>
                                          {kezeles.category && (
                                            <span className="text-xs text-muted-foreground ml-2 shrink-0">
                                              {kezeles.category}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    {szotarKezelesek.filter(k => k.name.toLowerCase().includes(item.name.toLowerCase())).length === 0 && (
                                      <div className="px-3 py-2 text-sm text-muted-foreground">
                                        Nincs találat
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                          </div>

                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(visitIndex, itemIndex, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-14 h-8 text-center"
                            min={1}
                          />

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
                                {isDragOverBottom && renderGhost(visitIndex, itemIndex)}
                              </Fragment>
                            );
                            })}
                          </>
                        );
                      })()}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => addItem(visitIndex)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!draggedItem) return;
                          e.dataTransfer.dropEffect = 'move';
                          const lastIdx = visit.items.length - 1;
                          if (lastIdx >= 0) {
                            setDragOverTarget(prev => {
                              if (prev?.visitIndex === visitIndex && prev?.itemIndex === lastIdx && prev?.direction === 'bottom') return prev;
                              return { visitIndex, itemIndex: lastIdx, direction: 'bottom' };
                            });
                          }
                        }}
                        onDrop={handleDrop}
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

      <CustomCategoryDialog
        open={customCategoryDialogOpen}
        onOpenChange={setCustomCategoryDialogOpen}
        telephelyId={clinicId}
        onSaved={(newCategory) => {
          setLocalCustomCategories(prev => [...prev, newCategory]);
          setCategory(newCategory);
        }}
      />
    </Dialog>

      {mode === 'native' && (
        <TreatmentItemEditorDialog
          open={newItemDialogOpen}
          onOpenChange={setNewItemDialogOpen}
          telephelyId={clinicId}
          availableCategories={availableCategories}
          onSaved={async (newItem) => {
            setNewItemDialogOpen(false);
            if (newItem && creatingItemFor) {
              await fetchSzotarKezelesek();
              updateItem(creatingItemFor.visitIndex, creatingItemFor.itemIndex, 'name', newItem.name);
              updateItem(creatingItemFor.visitIndex, creatingItemFor.itemIndex, 'item_id', newItem.id);
            }
            setCreatingItemFor(null);
          }}
        />
      )}
    </>
  );
}
