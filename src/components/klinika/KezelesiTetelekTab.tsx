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
import { Search, Plus, Pencil, Trash2, Loader2, Upload, FileUp, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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
}

interface KezelesiTetelekTabProps {
  telephelyId: string;
}

// ─── Visual cue preview chip ─────────────────────────────────────────────────

function VisualCueChip({ color, label }: { color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border"
      style={{ borderColor: color + '40', backgroundColor: color + '15', color }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function KezelesiTetelekTab({ telephelyId }: KezelesiTetelekTabProps) {
  const [items, setItems] = useState<any[]>([]);
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
  const [editingItem, setEditingItem] = useState<TreatmentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryDialogOpen, setCustomCategoryDialogOpen] = useState(false);
  const [formSubcategory, setFormSubcategory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formIsPerTooth, setFormIsPerTooth] = useState(true);
  const [formVisualCue, setFormVisualCue] = useState<TreatmentVisualCue | null>(null);

  // CSV import state
  const [importing, setImporting] = useState(false);

  // State variables for delete cascade warning
  const [deleteWarningOpen, setDeleteWarningOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ item: any, affectedRuleIds: string[] } | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, customCatRes] = await Promise.all([
        supabase
          .from('clinic_treatment_items_stdl')
          .select('*')
          .eq('telephely_id', telephelyId)
          .order('name', { ascending: true }),
        supabase
          .from('clinic_custom_categories')
          .select('*')
          .eq('telephely_id', telephelyId)
          .eq('mode', 'nativ')
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (itemsRes.data) {
        setItems(itemsRes.data);
      }

      if (customCatRes.data) {
        setDbCustomCategories(customCatRes.data);
      }
    } catch (error: any) {
      toast.error('Hiba történt az adatok betöltésekor: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => { loadItems(); }, [loadItems]);

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
    setFormName('');
    setFormCategory('');
    setIsCustomCategory(false);
    setFormSubcategory('');
    setFormPrice('');
    setFormIsPerTooth(true);
    setFormVisualCue(null);
    setDialogOpen(true);
  };

  const openEditDialog = (item: TreatmentItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setIsCustomCategory(!TREATMENT_CATEGORIES.includes(item.category as any));
    setFormSubcategory(item.subcategory || '');
    setFormPrice(item.price?.toString() || '');
    setFormIsPerTooth(item.is_per_tooth);
    setFormVisualCue({
      visual_group: item.visual_group,
      visual_color: item.visual_color,
      visual_icon: item.visual_icon,
      label: item.category,
    });
    setDialogOpen(true);
  };

  // Auto-classify when name or category changes
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
        subcategory: formSubcategory.trim() || null,
        price: formPrice ? parseInt(formPrice, 10) : null,
        is_per_tooth: formIsPerTooth,
        visual_group: cue.visual_group,
        visual_color: cue.visual_color,
        visual_icon: cue.visual_icon,
        updated_at: new Date().toISOString(),
      };

      if (editingItem) {
        const { error } = await supabase
          .from('clinic_treatment_items_stdl' as any)
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast.success('Tétel frissítve');
      } else {
        const { error } = await supabase
          .from('clinic_treatment_items_stdl' as any)
          .insert(payload);
        if (error) throw error;
        toast.success('Új tétel létrehozva');
      }

      setDialogOpen(false);
      loadItems();

      // Trigger embedding generation in the background
      supabase.functions.invoke('generate-szotar-embeddings', {
        body: { telephely_id: telephelyId, mode: 'native' }
      }).catch(console.error);

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
      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .update({ is_active: newVal })
        .eq('id', item.id);
      if (error) throw error;

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
          <div className="flex items-center gap-2">
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
                          {isWarning && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Hiányos adatok!" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <VisualCueChip color={displayColor} label={item.category} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.is_per_tooth ? 'Fog' : 'Szájüreg'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatPrice(item.price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={() => handleToggleActive(item)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Tétel szerkesztése' : 'Új kezelési tétel'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Megnevezés *</Label>
              <Input value={formName} onChange={e => handleNameChange(e.target.value)} placeholder="pl. Kompozit tömés (2 felszín)" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategória *</Label>
                {isCustomCategory ? (
                  <Input
                    placeholder="Új kategória..."
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    onBlur={() => { if (!formCategory) setIsCustomCategory(false) }}
                    autoFocus
                  />
                ) : (
                  <Select value={formCategory} onValueChange={(val) => {
                    if (val === 'custom') {
                      setCustomCategoryDialogOpen(true);
                    } else {
                      handleCategoryChange(val);
                    }
                  }}>
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
              <div className="space-y-1.5">
                <Label className="text-xs">Alkategória</Label>
                <Input value={formSubcategory} onChange={e => setFormSubcategory(e.target.value)} placeholder="Opcionális" />
              </div>
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
                  <span className="text-sm">{formIsPerTooth ? 'Fog' : 'Szájüreg'}</span>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Mégse</Button>
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
          loadItems();
          setFormCategory(newCategoryName);
        }}
      />

      {/* Deactivation Cascade Warning Dialog */}
      <Dialog open={deactivateWarningOpen} onOpenChange={setDeactivateWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Figyelmeztetés: Kaszkádolt Inaktiválás
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm">
              Ezt a kezelési tételt (<strong>{itemToDeactivate?.item?.name}</strong>) jelenleg{' '}
              <strong>{itemToDeactivate?.affectedRuleIds?.length}</strong> aktív kezelési szabály (Treatment Rule) használja.
            </p>
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg border border-border">
              Ha kikapcsolja ezt a tételt, az összes rá épülő szabály <strong>automatikusan inaktívvá válik</strong>! Folytatja a műveletet?
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateWarningOpen(false)}>Mégse</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (itemToDeactivate) {
                  executeToggleActive(itemToDeactivate.item, false, itemToDeactivate.affectedRuleIds);
                }
              }}
              disabled={isDeactivating}
            >
              {isDeactivating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Tétel és Szabályok Kikapcsolása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deletion Cascade Warning Dialog */}
      <Dialog open={deleteWarningOpen} onOpenChange={setDeleteWarningOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Figyelmeztetés: Törlés és Kaszkádolt Inaktiválás
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm">
              Ezt a kezelési tételt (<strong>{itemToDelete?.item?.name}</strong>) jelenleg{' '}
              <strong>{itemToDelete?.affectedRuleIds.length}</strong> aktív kezelési szabály használja.
            </p>
            <p className="text-sm">
              Ha törli ezt a tételt, a tétel elveszíti a kapcsolatát a szótárral a kezelési szabályokban, és a kapcsolódó kezelési szabályok <strong>automatikusan inaktívvá válnak</strong>.
            </p>
            <p className="text-sm font-medium">
              Biztosan folytatja a törlést? Ez a művelet nem vonható vissza.
            </p>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteWarningOpen(false)}>
              Mégse
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (itemToDelete) {
                  executeDelete(itemToDelete.item, itemToDelete.affectedRuleIds);
                }
              }}
              disabled={isDeactivating}
            >
              {isDeactivating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Törlés és Szabályok Inaktiválása
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedCard>
  );
}
