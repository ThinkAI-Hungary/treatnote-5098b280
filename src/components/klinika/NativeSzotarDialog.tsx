import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TREATMENT_CATEGORIES, classifyTreatmentItem } from '@/lib/treatmentClassifier';
import { toast } from '@/hooks/useToastMessage';
import { notifySzotarDataChanged } from '@/lib/szotarEvents';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomCategoryDialog } from './CustomCategoryDialog';
import { FileUp, Pencil, Plus, Trash2, Loader2 } from 'lucide-react';

interface NativeSzotarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  telephelyId: string | null;
  onSaved: () => void;
}

export function NativeSzotarDialog({ open, onOpenChange, telephelyId, onSaved }: NativeSzotarDialogProps) {
  const [rows, setRows] = useState<{ name: string; category: string; subcategory: string; price: string; _isCustomCategory?: boolean }[]>([
    { name: '', category: '', subcategory: '', price: '', _isCustomCategory: false }
  ]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [customCategoryDialogOpen, setCustomCategoryDialogOpen] = useState(false);
  const [pendingCategoryRowIndex, setPendingCategoryRowIndex] = useState<number | null>(null);

  // We need to fetch the custom categories that have been saved
  const [dbCustomCategories, setDbCustomCategories] = useState<string[]>([]);

  useEffect(() => {
    if (open && telephelyId) {
      // Fetch custom categories
      supabase
        .from('clinic_custom_categories')
        .select('name')
        .eq('telephely_id', telephelyId)
        .eq('mode', 'nativ')
        .then(({ data }) => {
          if (data) {
            setDbCustomCategories(data.map(d => d.name));
          }
        });

      setIsLoadingData(true);
      supabase
        .from('clinic_treatment_items_stdl')
        .select('*')
        .eq('telephely_id', telephelyId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            setRows(data.map((item: any) => {
              const cat = item.category === 'Egyéb' ? '' : item.category || '';
              return {
                name: item.name || '',
                category: cat,
                subcategory: item.subcategory || '',
                price: item.price ? item.price.toString() : '',
                _isCustomCategory: cat && !TREATMENT_CATEGORIES.includes(cat as any)
              };
            }));
          } else {
            setRows([{ name: '', category: '', subcategory: '', price: '', _isCustomCategory: false }]);
          }
        })
        .finally(() => {
          setIsLoadingData(false);
        });
    } else {
      setRows([{ name: '', category: '', subcategory: '', price: '', _isCustomCategory: false }]);
    }
  }, [open, telephelyId]);
  
  const handleAddRow = () => {
    setRows([...rows, { name: '', category: '', subcategory: '', price: '', _isCustomCategory: false }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'name' | 'category' | 'subcategory' | 'price' | '_isCustomCategory', value: string | boolean) => {
    const newRows = [...rows];
    (newRows[index] as any)[field] = value;
    setRows(newRows);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !telephelyId) return;
    e.target.value = '';

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('A CSV fájl üres vagy hibás'); return; }

      const sep = lines[0].includes(';') ? ';' : ',';
      const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const nameIdx = header.findIndex(h => h === 'name' || h === 'név' || h === 'nev');
      const catIdx = header.findIndex(h => h === 'category' || h === 'kategória' || h === 'kategoria');
      const priceIdx = header.findIndex(h => h === 'price' || h === 'ár' || h === 'ar');

      if (nameIdx === -1) { toast.error('Hiányzó "name" vagy "név" oszlop a CSV-ben'); return; }

      const csvItems: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        const name = cols[nameIdx];
        if (!name) continue;

        const category = catIdx >= 0 ? cols[catIdx] || 'Egyéb' : 'Egyéb';
        const price = priceIdx >= 0 ? parseInt(cols[priceIdx]?.replace(/\D/g, ''), 10) || null : null;
        const cue = classifyTreatmentItem(name, category);

        csvItems.push({
          telephely_id: telephelyId,
          name,
          category,
          price,
          visual_group: cue.visual_group,
          visual_color: cue.visual_color,
          visual_icon: cue.visual_icon,
        });
      }

      if (csvItems.length === 0) { toast.error('Nem található érvényes sor'); return; }

      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .upsert(csvItems, { onConflict: 'telephely_id,name', ignoreDuplicates: true });

      if (error) throw error;
      toast.success(`${csvItems.length} tétel importálva`);
      notifySzotarDataChanged();
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error('CSV import error:', err);
      toast.error('Hiba az importáláskor: ' + (err.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!telephelyId) return;

    const validRows = rows.filter(r => r.name.trim() !== '');
    if (validRows.length === 0) {
      toast.error('Kérjük adjon meg legalább egy kezelést!');
      return;
    }

    setIsSaving(true);
    try {
      const itemsToInsert = validRows.map(row => ({
        telephely_id: telephelyId,
        name: row.name.trim(),
        category: row.category.trim() || 'Egyéb',
        subcategory: row.subcategory.trim() || null,
        price: row.price ? parseInt(row.price, 10) : null
      }));

      const { error } = await supabase
        .from('clinic_treatment_items_stdl')
        .upsert(itemsToInsert, { onConflict: 'telephely_id,name' });

      if (error) throw error;

      toast.success('Szótár sikeresen mentve!');
      notifySzotarDataChanged();
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Hiba történt a mentés során: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Kezelési tételek beállítása</DialogTitle>
          <DialogDescription>
            Adja meg a klinika kezelési tételeit. Ezt megteheti fájl feltöltésével vagy kézi szerkesztéssel.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Kézi szerkesztés
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              Fájl feltöltése
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="manual" className="mt-4 space-y-4">
            <div className="space-y-4 max-h-[400px] overflow-y-auto p-1 pr-2">
              <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_auto] gap-3 items-center mb-2 px-1">
                <Label className="text-muted-foreground">Név</Label>
                <Label className="text-muted-foreground">Kategória</Label>
                <Label className="text-muted-foreground">Típus</Label>
                <Label className="text-muted-foreground">Ár (Ft)</Label>
                <div className="w-8"></div>
              </div>
              
              {isLoadingData ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_auto] gap-3 items-center">
                  <Input 
                    placeholder="Pl. Tömés"
                    value={row.name}
                    onChange={(e) => handleChange(i, 'name', e.target.value)}
                  />
                  {row._isCustomCategory ? (
                    <Input 
                      placeholder="Új kategória..."
                      value={row.category}
                      onChange={(e) => handleChange(i, 'category', e.target.value)}
                      onBlur={() => { if(!row.category) handleChange(i, '_isCustomCategory', false) }}
                      autoFocus
                    />
                  ) : (
                    <Select 
                      value={row.category || undefined} 
                      onValueChange={(val) => {
                        if (val === 'custom') {
                           setPendingCategoryRowIndex(i);
                           setCustomCategoryDialogOpen(true);
                        } else {
                           handleChange(i, 'category', val);
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Válassz..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom" className="text-primary font-bold bg-primary/5 mb-1 sticky top-0 z-10 backdrop-blur-md">+ Új kategória...</SelectItem>
                        {Array.from(new Set([...TREATMENT_CATEGORIES, ...dbCustomCategories]))
                          .sort((a, b) => a.localeCompare(b, 'hu'))
                          .map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                        }
                      </SelectContent>
                    </Select>
                  )}
                  <Input 
                    placeholder="Pl. 1 felszínű"
                    value={row.subcategory}
                    onChange={(e) => handleChange(i, 'subcategory', e.target.value)}
                  />
                  <Input 
                    type="number"
                    placeholder="0"
                    value={row.price}
                    onChange={(e) => handleChange(i, 'price', e.target.value)}
                  />
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveRow(i)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              
              {!isLoadingData && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddRow}
                  className="w-full flex items-center justify-center gap-2 mt-2 border-dashed text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Új sor hozzáadása
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4 space-y-4">
            <label htmlFor="modal-csv-import" className="block cursor-pointer">
              <input
                id="modal-csv-import"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
                disabled={importing}
              />
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-10 flex flex-col items-center justify-center text-center hover:bg-muted/50 transition-colors">
                {importing ? (
                  <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                ) : (
                  <FileUp className="h-10 w-10 text-muted-foreground mb-4" />
                )}
                <h3 className="font-semibold mb-1">
                  {importing ? 'Feltöltés folyamatban...' : 'Húzza ide a fájlt'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {importing ? 'Kérjük várjon...' : 'vagy kattintson a tallózáshoz'}
                </p>
                <p className="text-xs text-muted-foreground mt-4">Támogatott formátumok: CSV</p>
              </div>
            </label>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Mégse
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Mentés
          </Button>
        </div>
      </DialogContent>

      <CustomCategoryDialog
        open={customCategoryDialogOpen}
        onOpenChange={setCustomCategoryDialogOpen}
        telephelyId={telephelyId || ''}
        mode="nativ"
        onSaved={(newCategoryName) => {
          setDbCustomCategories(prev => {
            if (!prev.includes(newCategoryName)) return [...prev, newCategoryName];
            return prev;
          });
          // When a new category is saved, if there is a pending index, assign it to that row
          if (pendingCategoryRowIndex !== null) {
            handleChange(pendingCategoryRowIndex, 'category', newCategoryName);
            setPendingCategoryRowIndex(null);
          }
        }}
      />
    </Dialog>
  );
}
