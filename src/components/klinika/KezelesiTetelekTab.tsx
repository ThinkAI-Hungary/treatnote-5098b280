import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus, Pencil, Trash2, Loader2, Upload, FileUp, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Lock, Unlock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
import {
  classifyTreatmentItem,
  getAllVisualGroups,
  TREATMENT_CATEGORIES,
  type TreatmentVisualCue,
} from '@/lib/treatmentClassifier';
import { AnimatedCard } from './AnimatedCard';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchCombinedTreatmentItems, type CombinedTreatmentItem } from '@/lib/treatmentItems';
import { subscribeToRulesChanges } from '@/lib/rulesEvents';
import { TreatmentItemEditorDialog } from './TreatmentItemEditorDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TreatmentItem {
  id: string;
  telephely_id: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number | null;
  visual_group: string;
  visual_color: string;
  visual_icon: string;
  is_per_tooth: boolean;
  applicable_statuses: string[] | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  embedding_status: string;
}

interface KezelesiTetelekTabProps {
  telephelyId: string;
}

import { VisualCueChip } from './VisualCueChip';

// ─── Main Component ──────────────────────────────────────────────────────────

export function KezelesiTetelekTab({ telephelyId }: KezelesiTetelekTabProps) {
  const [items, setItems] = useState<CombinedTreatmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbCustomCategories, setDbCustomCategories] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showWarnings, setShowWarnings] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CombinedTreatmentItem | null>(null);
  const [saving, setSaving] = useState(false);



  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data: customCatData } = await supabase
        .from('clinic_custom_categories')
        .select('*')
        .eq('telephely_id', telephelyId)
        .eq('mode', 'nativ');

      const combined = await fetchCombinedTreatmentItems(telephelyId);
      setItems(combined);

      if (customCatData) {
        setDbCustomCategories(customCatData);
      }
    } catch (error: any) {
      toast.error('Hiba történt az adatok betöltésekor: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);



  const handleToggleLock = async (item: CombinedTreatmentItem) => {
    if (!item.is_default) return;
    try {
      const newLockedState = !item.is_locked;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_locked: newLockedState } : i));
      
      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .update({ is_locked: newLockedState })
        .eq('id', item.id);
        
      if (error) throw error;
      toast.success(newLockedState ? 'Tétel rögzítve a saját szótáradban.' : 'Tétel rögzítése feloldva.');
    } catch (err: any) {
      toast.error('Hiba az állapot frissítésekor: ' + err.message);
      loadItems(); // rollback
    }
  };

  useEffect(() => { 
    loadItems(); 
    const unsubscribe = subscribeToRulesChanges(() => {
      loadItems();
    });

    let debounceTimer: NodeJS.Timeout;

    // Realtime subscription to detect changes (debounced to prevent freezing on bulk inserts)
    const channel = supabase.channel('clinic_treatment_items_stdl_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clinic_treatment_items_stdl',
          filter: `telephely_id=eq.${telephelyId}`
        },
        () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadItems();
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadItems, telephelyId]);

  // ─── Filtering ───────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    let result = items.filter(item => {

      const isWarning = !item.name || !item.category || item.price === null || item.price === undefined;
      if (showWarnings && !isWarning) return false;

      const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    if (sortConfig !== null) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue, 'hu')
            : bValue.localeCompare(aValue, 'hu');
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [items, searchTerm, categoryFilter, sortConfig, showWarnings]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-0 group-hover:opacity-50 transition-opacity" />;
    }
    return sortConfig.direction === 'asc'
      ? <ArrowUp className="ml-2 h-4 w-4 text-primary" />
      : <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const availableCategories = useMemo(() => {
    const custom = items.map(i => i.category).filter(Boolean);
    return Array.from(new Set([...TREATMENT_CATEGORIES, ...dbCustomCategories.map(c => c.name), ...custom])).sort((a, b) => a.localeCompare(b, 'hu'));
  }, [items, dbCustomCategories]);

  const warningCount = useMemo(() => {
    return items.filter(item => !item.name || !item.category || item.price === null || item.price === undefined).length;
  }, [items]);

  const uniqueCategories = useMemo(() => {
    return availableCategories;
  }, [availableCategories]);

  // ─── Form Handlers ──────────────────────────────────────────────────────

  const openNewDialog = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const openEditDialog = (item: CombinedTreatmentItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };



  const handleDelete = async (item: TreatmentItem) => {
    executeDelete(item);
  };

  const executeDelete = async (item: any) => {
    setDeleteWarningOpen(false);
    setItems(prev => prev.filter(i => i.id !== item.id));

    try {
      if (!item.id || item.id.includes('temp-')) {
         toast.success('Ideiglenes tétel sikeresen törölve.');
         return;
      }

      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      toast.success('Kezelési tétel sikeresen törölve.');
      window.dispatchEvent(new Event('SZOTAR_DATA_CHANGED'));
    } catch (error: any) {
      toast.error('Hiba történt a törlés során: ' + error.message);
      loadItems(); // rollback
    }
  };

  const handleToggleActive = async (item: any) => {
    executeToggleActive(item);
  };

  const executeToggleActive = async (item: any) => {
    const newVal = !item.is_active;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: newVal } : i));
    setDeactivateWarningOpen(false);

    try {
      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .update({ is_active: newVal })
        .eq('id', item.id);
        
      if (error) throw error;
    } catch (error: any) {
      toast.error('Hiba az állapot frissítésekor');
      loadItems();
    }
  };



  // ─── Render ──────────────────────────────────────────────────────────────

  const formatPrice = (p: number | null) => {
    if (p === null || p === undefined) return '–';
    return p.toLocaleString('hu-HU') + ' Ft';
  };

  return (
    <AnimatedCard className="relative overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            Kezelési Tervek
            <Badge variant="secondary" className="ml-2 text-xs">{items.length} terv</Badge>
          </CardTitle>

        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Keresés név szerint..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Kategória" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Minden kategória</SelectItem>
              {uniqueCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showWarnings ? "destructive" : "outline"}
            size="sm"
            onClick={() => setShowWarnings(!showWarnings)}
            className="h-9 transition-colors"
          >
            <AlertTriangle className={cn("h-4 w-4 mr-2", showWarnings ? "text-white" : "text-amber-500")} />
            Figyelmeztetések
            {warningCount > 0 && (
              <Badge variant={showWarnings ? "secondary" : "destructive"} className="ml-2 px-1.5 py-0 text-[10px]">
                {warningCount}
              </Badge>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">Nincs tétel</p>
            <p className="text-sm mt-1">
              {items.length === 0
                ? 'Adjon hozzá kezelési tételeket kézzel vagy CSV importtal.'
                : 'A keresési feltételeknek nincs megfelelő tétel.'}
            </p>
          </div>
        ) : (
          <div
            className="custom-scrollbar-purple"
            style={{
              maxHeight: '600px',
              overflowY: 'scroll',
              borderRadius: '0.5rem',
              border: '1px solid hsl(var(--border) / 0.5)',
              scrollbarWidth: 'thin',
              scrollbarColor: 'hsl(var(--primary) / 0.4) transparent',
            }}
          >
            <Table wrapperClassName="overflow-visible border-0 bg-transparent rounded-none">
              <TableHeader className="sticky top-0 z-10 bg-[#f4f2f7] dark:bg-[#1a1625] shadow-sm border-b">
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[300px] cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Név {getSortIcon('name')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('category')}>
                    <div className="flex items-center">Kategória {getSortIcon('category')}</div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('is_per_tooth')}>
                    <div className="flex items-center">Típus {getSortIcon('is_per_tooth')}</div>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('price')}>
                    <div className="flex items-center justify-end">Ár {getSortIcon('price')}</div>
                  </TableHead>
                  <TableHead className="text-center w-[80px] cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('is_active')}>
                    <div className="flex items-center justify-center">Aktív {getSortIcon('is_active')}</div>
                  </TableHead>
                  <TableHead className="text-right w-[100px]">Műveletek</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => {
                  const dbCat = dbCustomCategories.find(c => c.name === item.category);
                  const displayColor = dbCat ? dbCat.color : item.visual_color;
                  const isWarning = !item.name || !item.category || item.price === null || item.price === undefined;

                  return (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "group transition-colors",
                        !item.is_active && "opacity-50",
                        isWarning && showWarnings && "bg-destructive/10"
                      )}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: displayColor }}
                          />
                          {item.name || <span className="text-muted-foreground italic">Névtelen</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <VisualCueChip color={displayColor} label={item.category} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.is_per_tooth ? 'Fog' : 'Szájüreg/Esetenkénti'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatPrice(item.price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-block">
                                <Switch
                                  checked={item.is_active}
                                  onCheckedChange={() => handleToggleActive(item)}
                                  // disabled={item.embedding_status === 'pending' || item.embedding_status === 'error'}
                                />
                              </div>
                            </TooltipTrigger>
                            {/*
                            {(item.embedding_status === 'pending' || item.embedding_status === 'error') && (
                              <TooltipContent>
                                <p>Az elem nem aktiválható, amíg az AI kereső (embedding) nem áll készen.</p>
                              </TooltipContent>
                            )}
                            */}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.is_default && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7" 
                                    onClick={() => handleToggleLock(item)}
                                  >
                                    {item.is_locked ? (
                                      <Lock className="h-3.5 w-3.5 text-orange-500" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{item.is_locked ? 'Zárolás feloldása (kikapcsolásnál eltűnik)' : 'Zárolás (kikapcsolásnál is megmarad)'}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ─── Add/Edit Dialog ────────────────────────────────────────────────── */}
      <TreatmentItemEditorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        telephelyId={telephelyId}
        editingItem={editingItem}
        onSaved={() => {
          setDialogOpen(false);
          loadItems();
        }}
        availableCategories={availableCategories}
      />

    </AnimatedCard>
  );
}
