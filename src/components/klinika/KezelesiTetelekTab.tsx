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
import { Search, Plus, Pencil, Trash2, Loader2, Upload, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  classifyTreatmentItem,
  getAllVisualGroups,
  TREATMENT_CATEGORIES,
  type TreatmentVisualCue,
} from '@/lib/treatmentClassifier';
import { AnimatedCard } from './AnimatedCard';

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
  const [items, setItems] = useState<TreatmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TreatmentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSubcategory, setFormSubcategory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formIsPerTooth, setFormIsPerTooth] = useState(true);
  const [formVisualCue, setFormVisualCue] = useState<TreatmentVisualCue | null>(null);

  // CSV import state
  const [importing, setImporting] = useState(false);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!telephelyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clinic_treatment_items_stdl' as any)
        .select('*')
        .eq('telephely_id', telephelyId)
        .order('category')
        .order('sort_order')
        .order('name');

      if (error) throw error;
      setItems((data || []) as unknown as TreatmentItem[]);
    } catch (err: any) {
      console.error('Error loading treatment items:', err);
      toast.error('Hiba a kezelési tételek betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ─── Filtering ───────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, categoryFilter]);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(items.map(i => i.category))).sort();
  }, [items]);

  // ─── Form Handlers ──────────────────────────────────────────────────────

  const openNewDialog = () => {
    setEditingItem(null);
    setFormName('');
    setFormCategory('');
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

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      const { error } = await supabase
        .from('clinic_treatment_items_stdl' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Tétel törölve');
    } catch (err: any) {
      toast.error('Hiba a törlésnél');
      loadItems();
    }
  };

  const handleToggleActive = async (item: TreatmentItem) => {
    const newVal = !item.is_active;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: newVal } : i));
    try {
      const { error } = await supabase
        .from('clinic_treatment_items_stdl' as any)
        .update({ is_active: newVal })
        .eq('id', item.id);
      if (error) throw error;
    } catch {
      toast.error('Hiba');
      loadItems();
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
      <CardHeader className="pb-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            Kezelési Tételek
            <Badge variant="secondary" className="ml-2 text-xs">{items.length} tétel</Badge>
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
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[300px]">Név</TableHead>
                  <TableHead>Kategória</TableHead>
                  <TableHead>Típus</TableHead>
                  <TableHead className="text-right">Ár</TableHead>
                  <TableHead className="text-center w-[80px]">Aktív</TableHead>
                  <TableHead className="text-right w-[100px]">Műveletek</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map(item => (
                  <TableRow
                    key={item.id}
                    className={cn(
                      "group transition-colors",
                      !item.is_active && "opacity-50"
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.visual_color }}
                        />
                        {item.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <VisualCueChip color={item.visual_color} label={item.category} />
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
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
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
                <Select value={formCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Válasszon..." /></SelectTrigger>
                  <SelectContent>
                    {TREATMENT_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
    </AnimatedCard>
  );
}
