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
  const [useDefaultLibrary, setUseDefaultLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbCustomCategories, setDbCustomCategories] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showWarnings, setShowWarnings] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Deactivation warning state
  const [deactivateWarningOpen, setDeactivateWarningOpen] = useState(false);
  const [itemToDeactivate, setItemToDeactivate] = useState<{ item: any, affectedRuleIds: string[] } | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CombinedTreatmentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // CSV import state
  const [importing, setImporting] = useState(false);

  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: any, affectedRuleIds: string[] } | null>(null);

  // Toggle off warning state
  const [toggleWarningOpen, setToggleWarningOpen] = useState(false);
  const [affectedRulesOnToggle, setAffectedRulesOnToggle] = useState<{ id: string, name: string }[]>([]);
  const [itemsToDisappearCount, setItemsToDisappearCount] = useState(0);
  const [pendingToggleState, setPendingToggleState] = useState<boolean | null>(null);

  // Unlock while library OFF warning state
  const [unlockWarningOpen, setUnlockWarningOpen] = useState(false);
  const [itemToUnlock, setItemToUnlock] = useState<{ item: CombinedTreatmentItem, affectedRules: { id: string, name: string }[] } | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [telephelyRes, customCatRes] = await Promise.all([
        supabase.from('telephely').select('use_default_library').eq('id', telephelyId).single(),
        supabase.from('clinic_custom_categories').select('*').eq('telephely_id', telephelyId).eq('mode', 'nativ')
      ]);

      if (telephelyRes.data) {
        setUseDefaultLibrary(telephelyRes.data.use_default_library || false);
      }

      const combined = await fetchCombinedTreatmentItems(telephelyId);
      setItems(combined);

      if (customCatRes.data) {
        setDbCustomCategories(customCatRes.data);
      }
    } catch (error: any) {
      toast.error('Hiba történt az adatok betöltésekor: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  const handleToggleDefaultLibrary = async (checked: boolean) => {
    if (checked) {
      executeToggleDefaultLibrary(true, []);
      return;
    }

    // Checking dependencies before turning OFF
    try {
      setIsDeactivating(true);
      
      // Items that are default and NOT locked will disappear
      const itemsToDisappear = items.filter(i => i.is_default && !i.is_locked);
      const itemsToDisappearIds = itemsToDisappear.map(i => i.id);

      if (itemsToDisappearIds.length === 0) {
        executeToggleDefaultLibrary(false, []);
        return;
      }

      // Check which rules use these items
      const { data: rules, error: rulesError } = await supabase
        .from('treatment_rules_stdl')
        .select(`
          id, 
          name, 
          visits:rule_visits_stdl(
            items:rule_items_stdl(item_id)
          )
        `)
        .eq('clinic_id', telephelyId)
        .eq('aktiv', true);

      if (rulesError) throw rulesError;

      const affectedRules: { id: string, name: string }[] = [];
      
      if (rules) {
        for (const rule of rules) {
          let hasItem = false;
          if (Array.isArray(rule.visits)) {
            for (const visit of rule.visits) {
              if (Array.isArray(visit.items) && visit.items.some((ri: any) => itemsToDisappearIds.includes(ri.item_id))) {
                hasItem = true;
                break;
              }
            }
          }
          if (hasItem) {
            affectedRules.push({ id: rule.id, name: rule.name });
          }
        }
      }

      if (affectedRules.length > 0) {
        setItemsToDisappearCount(itemsToDisappearIds.length);
        setAffectedRulesOnToggle(affectedRules);
        setPendingToggleState(false);
        setToggleWarningOpen(true);
      } else {
        executeToggleDefaultLibrary(false, []);
      }
    } catch (err: any) {
      toast.error('Hiba a függőségek ellenőrzésekor: ' + err.message);
    } finally {
      setIsDeactivating(false);
    }
  };

  const executeToggleDefaultLibrary = async (checked: boolean, affectedRuleIds: string[]) => {
    setToggleWarningOpen(false);
    try {
      setUseDefaultLibrary(checked);
      const { error } = await supabase
        .from('telephely')
        .update({ use_default_library: checked })
        .eq('id', telephelyId);
      if (error) throw error;
      
      // Deactivate affected rules
      if (affectedRuleIds.length > 0) {
        for (const ruleId of affectedRuleIds) {
          await supabase
            .from('treatment_rules_stdl')
            .update({ aktiv: false })
            .eq('id', ruleId);
        }
        toast.warning(`${affectedRuleIds.length} db kezelési szabály inaktiválva lett.`);
      }

      loadItems();
      window.dispatchEvent(new Event('SZOTAR_DATA_CHANGED'));
      toast.success(checked ? 'Központi kezelési tervek bekapcsolva' : 'Központi kezelési tervek kikapcsolva');
    } catch (err: any) {
      toast.error('Hiba az állapot frissítésekor');
      setUseDefaultLibrary(!checked);
    }
  };

  const handleToggleLockClick = async (item: CombinedTreatmentItem) => {
    if (!item.is_default) return;
    
    const newLockedState = !item.is_locked;
    
    if (newLockedState === false && !useDefaultLibrary) {
      // Unlocking while the library is OFF
      try {
        setIsDeactivating(true);
        const { data: rules, error: rulesError } = await supabase
          .from('treatment_rules_stdl')
          .select(`
            id, 
            name, 
            visits:rule_visits_stdl(
              items:rule_items_stdl(item_id)
            )
          `)
          .eq('clinic_id', telephelyId)
          .eq('aktiv', true);

        if (rulesError) throw rulesError;

        const affectedRules: { id: string, name: string }[] = [];
        if (rules) {
          for (const rule of rules) {
            let hasItem = false;
            if (Array.isArray(rule.visits)) {
              for (const visit of rule.visits) {
                if (Array.isArray(visit.items) && visit.items.some((ri: any) => ri.item_id === item.id)) {
                  hasItem = true;
                  break;
                }
              }
            }
            if (hasItem) {
              affectedRules.push({ id: rule.id, name: rule.name });
            }
          }
        }

        setItemToUnlock({ item, affectedRules });
        setUnlockWarningOpen(true);
      } catch (err: any) {
        toast.error('Hiba a függőségek ellenőrzésekor: ' + err.message);
      } finally {
        setIsDeactivating(false);
      }
      return;
    }
    
    // Normal toggle
    handleToggleLock(item);
  };

  const handleToggleLock = async (item: CombinedTreatmentItem) => {
    if (!item.is_default) return;
    try {
      const newLockedState = !item.is_locked;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_locked: newLockedState } : i));
      
      const { error } = await supabase
        .from('clinic_item_overrides')
        .upsert({
          telephely_id: telephelyId,
          default_item_id: item.id,
          is_locked: newLockedState,
          price: item.price,
          is_active: item.is_active,
        }, { onConflict: 'telephely_id,default_item_id' });
        
      if (error) throw error;
      toast.success(newLockedState ? 'Tétel zárolva, nem fog eltűnni kikapcsoláskor.' : 'Tétel zárolása feloldva.');
    } catch (err: any) {
      toast.error('Hiba a zárolás módosításakor');
      loadItems();
    }
  };

  const executeUnlockAndRemove = async () => {
    if (!itemToUnlock) return;
    const { item, affectedRules } = itemToUnlock;
    setUnlockWarningOpen(false);
    
    try {
      setIsDeactivating(true);
      
      // Remove from UI immediately
      setItems(prev => prev.filter(i => i.id !== item.id));

      const { error } = await supabase
        .from('clinic_item_overrides')
        .upsert({
          telephely_id: telephelyId,
          default_item_id: item.id,
          is_locked: false,
          price: item.price,
          is_active: item.is_active,
        }, { onConflict: 'telephely_id,default_item_id' });
        
      if (error) throw error;
      
      if (affectedRules.length > 0) {
        for (const rule of affectedRules) {
          await supabase
            .from('treatment_rules_stdl')
            .update({ aktiv: false })
            .eq('id', rule.id);
        }
        toast.warning(`A tétel kikerült a listából, és ${affectedRules.length} db érintett kezelési szabály inaktiválva lett.`);
      } else {
        toast.success('Tétel zárolása feloldva, kikerült a listából.');
      }
      
      window.dispatchEvent(new Event('SZOTAR_DATA_CHANGED'));
    } catch (err: any) {
      toast.error('Hiba a zárolás feloldásakor');
      loadItems();
    } finally {
      setIsDeactivating(false);
      setItemToUnlock(null);
    }
  };

  useEffect(() => { 
    loadItems(); 
    const unsubscribe = subscribeToRulesChanges(() => {
      loadItems();
    });

    // Realtime subscription to detect when the Edge Function finishes generating the embedding
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
          loadItems();
        }
      )
      .subscribe();

    return () => {
      unsubscribe();
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
    try {
      setIsDeactivating(true); // Reusing this loading state for the check
      const { data: rules, error: rulesError } = await supabase
        .from('treatment_rules')
        .select(`id, name, visits:rule_visits(items:rule_items(item_id))`)
        .eq('clinic_id', telephelyId)
        .eq('aktiv', true);

      if (rulesError) throw rulesError;

      const affectedRuleIds: string[] = [];
      if (rules) {
        for (const rule of rules) {
          let hasItem = false;
          if (Array.isArray(rule.visits)) {
            for (const visit of rule.visits) {
              if (Array.isArray(visit.items) && visit.items.some((ri: any) => ri.item_id === item.id)) {
                hasItem = true;
                break;
              }
            }
          }
          if (hasItem) affectedRuleIds.push(rule.id);
        }
      }

      if (affectedRuleIds.length > 0) {
        setItemToDelete({ item, affectedRuleIds });
        setDeleteWarningOpen(true);
      } else {
        executeDelete(item, []);
      }
    } catch (error: any) {
      console.error("Dependency check error:", error);
      toast.error("Hiba a függőségek ellenőrzésekor: " + error.message);
    } finally {
      setIsDeactivating(false);
    }
  };

  const executeDelete = async (item: any, affectedRuleIds: string[]) => {
    setDeleteWarningOpen(false);
    setItems(prev => prev.filter(i => i.id !== item.id));

    try {
      // Ha vannak érintett aktív szabályok, inaktiváljuk őket
      if (affectedRuleIds && affectedRuleIds.length > 0) {
        for (const ruleId of affectedRuleIds) {
          await supabase
            .from('treatment_rules')
            .update({ aktiv: false })
            .eq('id', ruleId);
        }
      }

      if (item.is_default) {
        // We cannot delete default items, this should not be reached due to UI hiding it, but just in case
        toast.error('Alapértelmezett tételt nem lehet törölni, csak kikapcsolni.');
        return;
      }

      const { error } = await supabase
        .from('clinic_treatment_items_stdl' as any)
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      if (affectedRuleIds.length > 0) {
        toast.success(`Tétel törölve, és ${affectedRuleIds.length} db érintett szabály inaktiválva.`);
      } else {
        toast.success('Tétel törölve');
      }
    } catch (err: any) {
      toast.error('Hiba a törlésnél');
      loadItems();
    }
  };

  const handleToggleActive = async (item: any) => {
    if (item.embedding_status === 'pending' || item.embedding_status === 'error') {
      toast.error('A tétel nem aktiválható, mert az embedding (AI kereső) generálása folyamatban van vagy hibára futott.');
      return;
    }

    const newVal = !item.is_active;

    // Ha bekapcsoljuk, vagy nincs DB ID-ja, csak simán mentsük
    if (newVal || !item.id) {
      executeToggleActive(item, newVal, []);
      return;
    }

    // Ha kikapcsoljuk, ellenőrizzük a függőségeket a treatment_rules-ban!
    try {
      setIsDeactivating(true);
      // Keresünk olyan AKTÍV szabályokat, amelyekben ez a tétel szerepel a rule_items_stdl-ben.
      const { data: rules, error: rulesError } = await supabase
        .from('treatment_rules_stdl')
        .select(`
          id, 
          name, 
          visits:rule_visits_stdl(
            items:rule_items_stdl(item_id)
          )
        `)
        .eq('clinic_id', telephelyId)
        .eq('aktiv', true); // FIGYELEM: a táblában 'aktiv' az oszlop neve!

      if (rulesError) throw rulesError;

      const affectedRuleIds: string[] = [];
      if (rules) {
        for (const rule of rules) {
          let hasItem = false;
          // végigmegyünk a rule_visits-en és a hozzájuk tartozó rule_items-eken
          if (Array.isArray(rule.visits)) {
            for (const visit of rule.visits) {
              if (Array.isArray(visit.items) && visit.items.some((ri: any) => ri.item_id === item.id)) {
                hasItem = true;
                break;
              }
            }
          }

          if (hasItem) {
            affectedRuleIds.push(rule.id);
          }
        }
      }

      if (affectedRuleIds.length > 0) {
        setItemToDeactivate({ item, affectedRuleIds });
        setDeactivateWarningOpen(true);
      } else {
        executeToggleActive(item, false, []);
      }
    } catch (error: any) {
      console.error("Dependency check error:", error);
      toast.error("Hiba a függőségek ellenőrzésekor: " + error.message);
    } finally {
      setIsDeactivating(false);
    }
  };

  const executeToggleActive = async (item: any, newVal: boolean, affectedRuleIds: string[]) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: newVal } : i));
    setDeactivateWarningOpen(false);

    try {
      setIsDeactivating(true);

      // Update item itself
      if (item.is_default) {
        const { error } = await supabase
          .from('clinic_item_overrides')
          .upsert({
            telephely_id: telephelyId,
            default_item_id: item.id,
            price: item.price,
            is_active: newVal,
          }, { onConflict: 'telephely_id,default_item_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('clinic_treatment_items_stdl')
          .update({ is_active: newVal })
          .eq('id', item.id);
        if (error) throw error;
      }

      // Update affected rules (cascade deactivation)
      if (affectedRuleIds && affectedRuleIds.length > 0) {
        for (const ruleId of affectedRuleIds) {
          const { error: ruleUpdateError } = await supabase
            .from('treatment_rules_stdl')
            .update({ aktiv: false }) // FIGYELEM: 'aktiv' az oszlop!
            .eq('id', ruleId);
          if (ruleUpdateError) {
            console.error("Failed to deactivate rule:", ruleId, ruleUpdateError);
          }
        }
        toast.warning(`A tétel és ${affectedRuleIds.length} db hozzá kapcsolódó kezelési szabály inaktiválva lett.`);
      }

    } catch (error: any) {
      toast.error('Hiba az állapot frissítésekor');
      loadItems();
    } finally {
      setIsDeactivating(false);
      setItemToDeactivate(null);
    }
  };

  // ─── CSV Import ──────────────────────────────────────────────────────────

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('A CSV fájl üres vagy hibás'); return; }

      // Parse header
      const sep = lines[0].includes(';') ? ';' : ',';
      const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const nameIdx = header.findIndex(h => h === 'name' || h === 'név' || h === 'nev');
      const catIdx = header.findIndex(h => h === 'category' || h === 'kategória' || h === 'kategoria');
      const priceIdx = header.findIndex(h => h === 'price' || h === 'ár' || h === 'ar');

      if (nameIdx === -1) { toast.error('Hiányzó "name" vagy "név" oszlop a CSV-ben'); return; }

      const rows: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx];
        if (!name) continue;

        const category = catIdx >= 0 ? cols[catIdx] || 'Egyéb' : 'Egyéb';
        const price = priceIdx >= 0 ? parseInt(cols[priceIdx]?.replace(/\D/g, ''), 10) || null : null;
        const cue = classifyTreatmentItem(name, category);

        rows.push({
          telephely_id: telephelyId,
          name,
          category,
          price,
          visual_group: cue.visual_group,
          visual_color: cue.visual_color,
          visual_icon: cue.visual_icon,
        });
      }

      if (rows.length === 0) { toast.error('Nem található érvényes sor'); return; }

      const { error } = await supabase
        .from('clinic_treatment_items_stdl' as any)
        .upsert(rows, { onConflict: 'telephely_id,name', ignoreDuplicates: true });

      if (error) throw error;
      toast.success(`${rows.length} tétel importálva`);
      window.dispatchEvent(new Event('SZOTAR_DATA_CHANGED'));
      loadItems();
    } catch (err: any) {
      console.error('CSV import error:', err);
      toast.error('Hiba az importáláskor: ' + (err.message || ''));
    } finally {
      setImporting(false);
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
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-md border border-primary/20">
              <Switch
                id="use-default-library"
                checked={useDefaultLibrary}
                onCheckedChange={handleToggleDefaultLibrary}
              />
              <Label htmlFor="use-default-library" className="text-sm font-medium cursor-pointer">
                Központi kezelési tervek használata
              </Label>
            </div>
            <label htmlFor="csv-import">
              <input
                id="csv-import"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
                disabled={importing}
              />
              <Button variant="outline" size="sm" asChild disabled={importing}>
                <span className="cursor-pointer">
                  {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileUp className="h-4 w-4 mr-1.5" />}
                  CSV Import
                </span>
              </Button>
            </label>
            <Button size="sm" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-1.5" /> Új tétel
            </Button>
          </div>
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
                  <TableHead className="w-[60px] text-center"></TableHead>
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
                        {item.embedding_status === 'pending' && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Dolgozunk rajta...
                          </div>
                        )}
                        {item.embedding_status === 'error' && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Hiba történt
                          </div>
                        )}
                        {item.embedding_status === 'ready' && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-emerald-500 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Beágyazás kész
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isWarning && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" title="Hiányos adatok!" />
                          )}
                          {item.is_default && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className={cn("h-6 w-6", item.is_locked ? "text-primary bg-primary/10" : "text-muted-foreground")} 
                              onClick={() => handleToggleLockClick(item)}
                              title={item.is_locked ? "Zárolva" : "Zárolás"}
                            >
                              {item.is_locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                            </Button>
                          )}
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
                                  disabled={item.embedding_status === 'pending' || item.embedding_status === 'error'}
                                />
                              </div>
                            </TooltipTrigger>
                            {(item.embedding_status === 'pending' || item.embedding_status === 'error') && (
                              <TooltipContent>
                                <p>Az elem nem aktiválható, amíg az AI kereső (embedding) nem áll készen.</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!item.is_default && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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

      {/* Deactivation Cascade Warning Dialog */}
      <ConfirmDialog
        open={deactivateWarningOpen}
        onOpenChange={setDeactivateWarningOpen}
        title="Tétel kikapcsolása"
        description={
          <div className="space-y-2">
            <p>
              Ezt a kezelési tételt (<strong>{itemToDeactivate?.item?.name}</strong>) jelenleg{' '}
              <strong>{itemToDeactivate?.affectedRuleIds?.length}</strong> aktív kezelési szabály használja.
            </p>
            <p>
              Ha kikapcsolja ezt a tételt, az összes rá épülő szabály <strong>automatikusan inaktívvá válik</strong>. Folytatja a műveletet?
            </p>
          </div>
        }
        confirmText="Kikapcsolás"
        cancelText="Mégse"
        onConfirm={() => {
          if (itemToDeactivate) {
            executeToggleActive(itemToDeactivate.item, false, itemToDeactivate.affectedRuleIds);
          }
        }}
        isLoading={isDeactivating}
        variant="warning"
      />

      {/* Deletion Cascade Warning Dialog */}
      <ConfirmDialog
        open={deleteWarningOpen}
        onOpenChange={setDeleteWarningOpen}
        title="Tétel törlése"
        description={
          <div className="space-y-2">
            <p>
              Ezt a kezelési tételt (<strong>{itemToDelete?.item?.name}</strong>) jelenleg{' '}
              <strong>{itemToDelete?.affectedRuleIds.length}</strong> aktív kezelési szabály használja.
            </p>
            <p>
              A tétel törlésével a kapcsolódó kezelési szabályok is <strong>automatikusan inaktívvá válnak</strong>.
            </p>
            <p className="font-semibold text-sm mt-2 text-foreground">
              Biztosan folytatja a törlést?
            </p>
          </div>
        }
        confirmText="Törlés"
        cancelText="Mégse"
        onConfirm={() => {
          if (itemToDelete) {
            executeDelete(itemToDelete.item, itemToDelete.affectedRuleIds);
          }
        }}
        isLoading={isDeactivating}
        variant="danger"
      />

      {/* ─── Toggle Off Warning Dialog ────────────────────────────────────────── */}
      {/* ─── Toggle Off Warning Dialog ────────────────────────────────────────── */}
      <ConfirmDialog
        open={toggleWarningOpen}
        onOpenChange={(open) => {
          setToggleWarningOpen(open);
          if (!open) setUseDefaultLibrary(true); // revert switch UI
        }}
        title="Központi szótár kikapcsolása"
        description={
          <div className="space-y-2">
            <p>
              A központi szótár kikapcsolásával <strong>{itemsToDisappearCount} db</strong> nem zárolt központi tétel el fog tűnni a listából.
            </p>
            {affectedRulesOnToggle.length > 0 && (
              <>
                <p className="font-semibold text-sm mt-2 text-foreground">
                  Ezek a tételek az alábbi {affectedRulesOnToggle.length} db aktív szabályban szerepelnek:
                </p>
                <ul className="list-disc pl-5 text-sm max-h-24 overflow-y-auto">
                  {affectedRulesOnToggle.map(rule => (
                    <li key={rule.id}>{rule.name}</li>
                  ))}
                </ul>
                <p className="mt-2 text-foreground font-medium">
                  Ha folytatja, ezek a szabályok automatikusan INAKTIVÁLVA lesznek!
                </p>
              </>
            )}
            <p className="mt-2">Biztosan kikapcsolja a központi szótárat?</p>
          </div>
        }
        confirmText="Kikapcsolás"
        cancelText="Mégse"
        onConfirm={() => executeToggleDefaultLibrary(false, affectedRulesOnToggle.map(r => r.id))}
        isLoading={isDeactivating}
        variant="warning"
      />

      {/* ─── Unlock Warning Dialog ────────────────────────────────────────────── */}
      {/* ─── Unlock Warning Dialog ────────────────────────────────────────────── */}
      <ConfirmDialog
        open={unlockWarningOpen}
        onOpenChange={setUnlockWarningOpen}
        title="Zárolás feloldása"
        description={
          <div className="space-y-2">
            <p>
              Mivel a központi szótár ki van kapcsolva, a zárolás feloldásával a rekord <strong>azonnal el fog tűnni a listából</strong>.
            </p>
            {itemToUnlock?.affectedRules && itemToUnlock.affectedRules.length > 0 && (
              <>
                <p className="font-semibold text-sm mt-2 text-foreground">
                  Ez a tétel az alábbi {itemToUnlock.affectedRules.length} db aktív szabályban szerepel:
                </p>
                <ul className="list-disc pl-5 text-sm max-h-24 overflow-y-auto">
                  {itemToUnlock.affectedRules.map(rule => (
                    <li key={rule.id}>{rule.name}</li>
                  ))}
                </ul>
                <p className="mt-2 text-foreground font-medium">
                  Ha folytatja, ezek a szabályok automatikusan INAKTIVÁLVA lesznek!
                </p>
              </>
            )}
            <p className="mt-2">Biztosan feloldja a zárolást?</p>
          </div>
        }
        confirmText="Zárolás feloldása"
        cancelText="Mégse"
        onConfirm={executeUnlockAndRemove}
        isLoading={isDeactivating}
        variant="warning"
      />

    </AnimatedCard>
  );
}
