import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface ClinicTreatmentItem {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number | null;
  visual_group: string;
  visual_color: string;
  visual_icon: string;
  is_per_tooth: boolean;
}

interface TreatmentItemPickerProps {
  telephelyId: string;
  onSelect: (item: ClinicTreatmentItem) => void;
  trigger?: React.ReactNode;
}

export function TreatmentItemPicker({ telephelyId, onSelect, trigger }: TreatmentItemPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClinicTreatmentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || items.length > 0) return;
    setLoading(true);
    supabase
      .from('clinic_treatment_items_stdl' as any)
      .select('id, name, category, subcategory, price, visual_group, visual_color, visual_icon, is_per_tooth')
      .eq('telephely_id', telephelyId)
      .eq('is_active', true)
      .order('category')
      .order('name')
      .then(({ data, error }) => {
        if (!error && data) {
          setItems(data as unknown as ClinicTreatmentItem[]);
          // Auto-expand first 2 groups
          const groups = Array.from(new Set((data as any[]).map(d => d.category)));
          const exp: Record<string, boolean> = {};
          groups.slice(0, 2).forEach(g => { exp[g] = true; });
          setExpandedGroups(exp);
        }
        setLoading(false);
      });
  }, [open, telephelyId]);

  const grouped = useMemo(() => {
    const filtered = items.filter(i =>
      !search || i.name.toLowerCase().includes(search.toLowerCase())
    );
    const map = new Map<string, ClinicTreatmentItem[]>();
    filtered.forEach(i => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category)!.push(i);
    });
    return Array.from(map.entries());
  }, [items, search]);

  const toggleGroup = (cat: string) => {
    setExpandedGroups(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleSelect = (item: ClinicTreatmentItem) => {
    onSelect(item);
    setOpen(false);
    setSearch('');
  };

  const formatPrice = (p: number | null) => p != null ? p.toLocaleString('hu-HU') + ' Ft' : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Tétel hozzáadása
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Keresés..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="max-h-[320px]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Betöltés...</div>
          ) : grouped.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {items.length === 0 ? 'Nincsenek tételek. Adjon hozzá a Klinika Admin-ban.' : 'Nincs találat.'}
            </div>
          ) : (
            <div className="py-1">
              {grouped.map(([category, catItems]) => {
                const isExpanded = expandedGroups[category];
                const color = catItems[0]?.visual_color || '#64748b';
                return (
                  <div key={category}>
                    <button
                      className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 transition-colors"
                      onClick={() => toggleGroup(category)}
                    >
                      <span className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        {category}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{catItems.length}</span>
                    </button>
                    {isExpanded && (
                      <div className="pb-1">
                        {catItems.map(item => (
                          <button
                            key={item.id}
                            className="w-full flex items-center justify-between px-4 py-1.5 text-sm hover:bg-primary/5 transition-colors text-left"
                            onClick={() => handleSelect(item)}
                          >
                            <span className="truncate pr-2">{item.name}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                              {formatPrice(item.price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
