import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { toast } from '@/hooks/useToastMessage';
import { supabase } from '@/integrations/supabase/client';

interface TreatmentItem {
  name: string;
  qty: number;
  unit: string;
  target_tooth_type?: string;
}

interface Visit {
  visit_no: number;
  duration_days?: number;
  healing_time_months?: number;
  items: TreatmentItem[];
}

interface ParsedJson {
  visits?: Visit[];
}

interface TreatmentPlanEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  fogalom: string;
  sourceFileName: string;
  initialData: ParsedJson;
  onSave: () => void;
}

export function TreatmentPlanEditor({
  open,
  onOpenChange,
  recordId,
  fogalom,
  sourceFileName,
  initialData,
  onSave,
}: TreatmentPlanEditorProps) {
  const [visits, setVisits] = useState<Visit[]>(() => 
    initialData.visits?.map((v, i) => ({ ...v, visit_no: i + 1 })) || []
  );
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<{ visitIndex: number; itemIndex: number } | null>(null);

  // Renumber visits
  const renumberVisits = useCallback((visitsToRenumber: Visit[]): Visit[] => {
    return visitsToRenumber.map((v, i) => ({ ...v, visit_no: i + 1 }));
  }, []);

  // Add new visit
  const addVisit = () => {
    setVisits(prev => renumberVisits([
      ...prev, 
      { visit_no: prev.length + 1, items: [], duration_days: undefined, healing_time_months: undefined }
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
  const updateVisit = (visitIndex: number, field: 'duration_days' | 'healing_time_months', value: number | undefined) => {
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
      return { ...visit, items: newItems };
    }));
  };

  // Move item to another visit
  const moveItemToVisit = (fromVisitIndex: number, itemIndex: number, toVisitIndex: number) => {
    setVisits(prev => {
      const newVisits = [...prev];
      const item = newVisits[fromVisitIndex].items[itemIndex];
      newVisits[fromVisitIndex] = {
        ...newVisits[fromVisitIndex],
        items: newVisits[fromVisitIndex].items.filter((_, i) => i !== itemIndex)
      };
      newVisits[toVisitIndex] = {
        ...newVisits[toVisitIndex],
        items: [...newVisits[toVisitIndex].items, item]
      };
      return newVisits;
    });
  };

  // Update item
  const updateItem = (visitIndex: number, itemIndex: number, field: keyof TreatmentItem, value: string | number) => {
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
      return { ...visit, items: visit.items.filter((_, i) => i !== itemIndex) };
    }));
  };

  // Add new item to visit
  const addItem = (visitIndex: number) => {
    setVisits(prev => prev.map((visit, vi) => {
      if (vi !== visitIndex) return visit;
      return { ...visit, items: [...visit.items, { name: '', qty: 1, unit: 'db', target_tooth_type: '' }] };
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
      // Reorder within same visit
      if (targetItemIndex !== undefined && targetItemIndex !== fromItemIndex) {
        setVisits(prev => prev.map((visit, vi) => {
          if (vi !== targetVisitIndex) return visit;
          const newItems = [...visit.items];
          const [removed] = newItems.splice(fromItemIndex, 1);
          newItems.splice(targetItemIndex, 0, removed);
          return { ...visit, items: newItems };
        }));
      }
    } else {
      // Move to different visit
      moveItemToVisit(fromVisitIndex, fromItemIndex, targetVisitIndex);
    }
    
    setDraggedItem(null);
  };

  // Save changes
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('szabalyepito_teszt_extractions')
        .update({ 
          parsed_json: { visits: renumberVisits(visits) } 
        })
        .eq('id', recordId);

      if (error) throw error;
      
      toast.success('Kezelési terv sikeresen mentve');
      onSave();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error saving treatment plan:', err);
      toast.error('Hiba a mentéskor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Kezelési terv szerkesztése</DialogTitle>
          <DialogDescription>
            {fogalom} • Forrás: {sourceFileName}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
          <div className="space-y-4">
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
                        {visit.visit_no}. vizit
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
                          placeholder="Napok"
                          className="w-20 h-8"
                          value={visit.duration_days ?? ''}
                          onChange={(e) => updateVisit(visitIndex, 'duration_days', e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                        <span className="text-sm text-muted-foreground">nap</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          placeholder="Hónapok"
                          className="w-20 h-8"
                          value={visit.healing_time_months ?? ''}
                          onChange={(e) => updateVisit(visitIndex, 'healing_time_months', e.target.value ? parseInt(e.target.value) : undefined)}
                        />
                        <span className="text-sm text-muted-foreground">hónap gyógyulás</span>
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
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        
                        <Input
                          value={item.name}
                          onChange={(e) => updateItem(visitIndex, itemIndex, 'name', e.target.value)}
                          placeholder="Elem neve"
                          className="flex-1 h-8"
                        />
                        
                        <Input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateItem(visitIndex, itemIndex, 'qty', parseInt(e.target.value) || 1)}
                          className="w-16 h-8 text-center"
                          min={1}
                        />
                        
                        <Input
                          value={item.unit}
                          onChange={(e) => updateItem(visitIndex, itemIndex, 'unit', e.target.value)}
                          placeholder="egység"
                          className="w-20 h-8"
                        />
                        
                        <Input
                          value={item.target_tooth_type ?? ''}
                          onChange={(e) => updateItem(visitIndex, itemIndex, 'target_tooth_type', e.target.value)}
                          placeholder="Fog típus"
                          className="w-24 h-8"
                          title="Target tooth type"
                        />
                        
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
                          
                          {/* Move to other visit dropdown */}
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
                      Új elem hozzáadása
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
        </ScrollArea>

        <DialogFooter className="mt-4">
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
