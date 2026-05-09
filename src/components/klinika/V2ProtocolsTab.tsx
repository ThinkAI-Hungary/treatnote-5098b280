import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Pencil, Trash2, RefreshCw, Package, ChevronDown, ChevronUp, Plus, X, GripVertical, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AnimatedCard } from './AnimatedCard';
import { actionName, ATOMIC_ACTION_OPTIONS } from '@/lib/atomicActionNames';
import { PROTOCOL_DEFAULTS } from '@/lib/protocolDefaults';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProtocolTemplate {
  id: string;
  slug: string;
  name_hu: string;
  category: string;
  triggers: string[];
  atomic_actions: string[];
  visits: { visit: number; name?: string; actions: string[] }[];
  description: string | null;
  is_global: boolean;
  telephely_id: string | null;
  reviewed: boolean;
}

interface V2ProtocolsTabProps {
  telephelyId: string;
}

const CATEGORIES = [
  { value: 'konzervalo', label: 'Konzerváló', color: '#3b82f6' },
  { value: 'fogpotlastan', label: 'Fogpótlástan', color: '#f59e0b' },
  { value: 'szajsebeszet', label: 'Szájsebészet', color: '#ef4444' },
  { value: 'implantacio', label: 'Implantáció', color: '#8b5cf6' },
  { value: 'parodontologia', label: 'Parodontológia', color: '#10b981' },
  { value: 'diagnosztika', label: 'Diagnosztika', color: '#6366f1' },
  { value: 'fogszabalyozas', label: 'Fogszabályozás', color: '#ec4899' },
  { value: 'egyeb', label: 'Egyéb', color: '#6b7280' },
];

function catColor(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.color || '#6b7280';
}

function catLabel(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.label || cat;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function V2ProtocolsTab({ telephelyId }: V2ProtocolsTabProps) {
  const [templates, setTemplates] = useState<ProtocolTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProtocolTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('egyeb');
  const [formTriggers, setFormTriggers] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formVisits, setFormVisits] = useState<{ visit: number; name?: string; actions: string[] }[]>([]);

  // Drag state
  const [dragInfo, setDragInfo] = useState<{ visitIdx: number; actionIdx: number } | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ visitIdx: number; actionIdx: number } | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    if (!telephelyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v2_protocol_templates' as any)
        .select('*')
        .or(`telephely_id.eq.${telephelyId},is_global.eq.true`)
        .order('category')
        .order('name_hu');

      if (error) throw error;
      setTemplates((data || []) as unknown as ProtocolTemplate[]);
    } catch (err: any) {
      console.error('Error loading templates:', err);
      toast.error('Hiba a protokollok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ─── Filtering ───────────────────────────────────────────────────────────

  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch = !searchTerm ||
        t.name_hu.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.triggers || []).some(tr => tr.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCat = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [templates, searchTerm, categoryFilter]);

  const groupedTemplates = useMemo(() => {
    const groups: Record<string, ProtocolTemplate[]> = {};
    for (const t of filteredTemplates) {
      const cat = t.category || 'egyeb';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    return groups;
  }, [filteredTemplates]);

  // ─── Edit Handlers ──────────────────────────────────────────────────────

  const openEditDialog = (t: ProtocolTemplate) => {
    setEditingTemplate(t);
    setFormName(t.name_hu);
    setFormCategory(t.category);
    setFormTriggers((t.triggers || []).join(', '));
    setFormDescription(t.description || '');
    const visits = (t.visits || []).length > 0
      ? t.visits.map(v => ({ ...v, actions: v.actions.length > 0 ? [...v.actions] : [''] }))
      : [{ visit: 1, actions: t.atomic_actions?.length > 0 ? [...t.atomic_actions] : [''] }];
    setFormVisits(visits);
    setDialogOpen(true);
  };

  const addVisit = () => {
    setFormVisits(prev => [...prev, { visit: prev.length + 1, name: '', actions: [''] }]);
  };

  const removeVisit = (idx: number) => {
    setFormVisits(prev => prev.filter((_, i) => i !== idx).map((v, i) => ({ ...v, visit: i + 1 })));
  };

  const addAction = (visitIdx: number) => {
    setFormVisits(prev => prev.map((v, i) => i === visitIdx ? { ...v, actions: [...v.actions, ''] } : v));
  };

  const removeAction = (visitIdx: number, actionIdx: number) => {
    setFormVisits(prev => prev.map((v, i) => i === visitIdx
      ? { ...v, actions: v.actions.filter((_, ai) => ai !== actionIdx) }
      : v
    ));
  };

  const updateAction = (visitIdx: number, actionIdx: number, val: string) => {
    setFormVisits(prev => prev.map((v, i) => i === visitIdx
      ? { ...v, actions: v.actions.map((a, ai) => ai === actionIdx ? val : a) }
      : v
    ));
  };

  const moveAction = (visitIdx: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setFormVisits(prev => prev.map((v, i) => {
      if (i !== visitIdx) return v;
      const actions = [...v.actions];
      const [moved] = actions.splice(fromIdx, 1);
      actions.splice(toIdx, 0, moved);
      return { ...v, actions };
    }));
  };

  const handleSave = async () => {
    if (!editingTemplate) return;
    if (!formName.trim()) { toast.error('A név megadása kötelező'); return; }

    const cleanVisits = formVisits.map(v => ({
      visit: v.visit,
      actions: v.actions.filter(a => a.trim()),
    })).filter(v => v.actions.length > 0);

    const allActions = cleanVisits.flatMap(v => v.actions);

    setSaving(true);
    try {
      const { error } = await supabase
        .from('v2_protocol_templates' as any)
        .update({
          name_hu: formName.trim(),
          category: formCategory,
          triggers: formTriggers.split(',').map(t => t.trim()).filter(Boolean),
          atomic_actions: allActions,
          visits: cleanVisits,
          description: formDescription.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;
      toast.success('Protokoll frissítve');
      setDialogOpen(false);
      loadTemplates();
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: ProtocolTemplate) => {
    setTemplates(prev => prev.filter(x => x.id !== t.id));
    try {
      const { error } = await supabase
        .from('v2_protocol_templates' as any)
        .delete()
        .eq('id', t.id);
      if (error) throw error;
      toast.success('Protokoll törölve');
    } catch {
      toast.error('Hiba a törlésnél');
      loadTemplates();
    }
  };

  // ─── Toggle reviewed status ─────────────────────────────────────────────

  const handleToggleReviewed = async (t: ProtocolTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !t.reviewed;
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, reviewed: newVal } : x));
    try {
      const { error } = await supabase
        .from('v2_protocol_templates' as any)
        .update({ reviewed: newVal, updated_at: new Date().toISOString() })
        .eq('id', t.id);
      if (error) throw error;
    } catch {
      setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, reviewed: !newVal } : x));
      toast.error('Hiba a státusz módosításakor');
    }
  };

  // ─── Reset to defaults ──────────────────────────────────────────────────

  const resetCurrentToDefault = () => {
    if (!editingTemplate) return;
    const def = PROTOCOL_DEFAULTS[editingTemplate.slug];
    if (!def) { toast.error('Nincs alapbeállítás ehhez a protokollhoz'); return; }
    setFormName(def.nameHu);
    setFormCategory(def.category);
    setFormTriggers(def.triggers.join(', '));
    setFormDescription(def.description || '');
    setFormVisits(def.visits.length > 0 ? def.visits.map(v => ({ ...v, actions: [...v.actions] })) : [{ visit: 1, actions: [...def.atomicActions] }]);
    toast.info('Alapbeállítás visszaállítva — kattintson a Mentés gombra a véglegesítéshez');
  };

  const [resettingAll, setResettingAll] = useState(false);

  const resetAllToDefaults = async () => {
    if (!confirm('Biztosan visszaállítja az összes protokollt az alapbeállításra? A módosítások elvesznek.')) return;
    setResettingAll(true);
    try {
      let updated = 0;
      for (const t of templates) {
        const def = PROTOCOL_DEFAULTS[t.slug];
        if (!def) continue;
        const { error } = await supabase
          .from('v2_protocol_templates' as any)
          .update({
            name_hu: def.nameHu, category: def.category, triggers: def.triggers,
            atomic_actions: def.atomicActions, visits: def.visits,
            description: def.description, updated_at: new Date().toISOString(),
          })
          .eq('id', t.id);
        if (!error) updated++;
      }
      toast.success(`${updated} protokoll visszaállítva`);
      loadTemplates();
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
    } finally {
      setResettingAll(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <AnimatedCard>
      <CardHeader className="pb-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Package className="h-5 w-5" />
            Kezelési Protokollok
            <Badge variant="secondary" className="ml-2 text-xs">{templates.length} protokoll</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetAllToDefaults} disabled={resettingAll}>
              {resettingAll ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1.5" />}
              Alapbeállítás
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadTemplates()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Frissítés
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Keresés név, trigger..."
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
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
        ) : templates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">Nincs protokoll</p>
            <p className="text-sm mt-1">A protokollok a rendszer részét képezik és automatikusan betöltődnek.</p>
          </div>
        ) : (
          <div className="divide-y">
            {Object.entries(groupedTemplates).map(([cat, items]) => (
              <div key={cat}>
                <div className="px-6 py-3 bg-muted/30 flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: catColor(cat) }}
                  />
                  <span className="text-sm font-medium">{catLabel(cat)}</span>
                  {items.every(i => i.reviewed)
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />
                    : <AlertTriangle className="h-4 w-4 text-yellow-500 ml-2" />
                  }
                  <Badge variant="secondary" className="text-xs ml-auto">{items.length}</Badge>
                </div>

                {items.map(t => (
                  <div key={t.id} className="group">
                    <div
                      className="px-6 py-3 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{t.name_hu}</span>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {(t.triggers || []).slice(0, 4).map((tr, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-normal">{tr}</Badge>
                          ))}
                          {(t.triggers || []).length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{t.triggers.length - 4}</span>
                          )}
                        </div>
                      </div>

                      <Badge variant="secondary" className="text-xs shrink-0">
                        {(t.atomic_actions || []).length} lépés
                      </Badge>

                      <button
                        onClick={e => handleToggleReviewed(t, e)}
                        title={t.reviewed ? 'Jóváhagyás visszavonása' : 'Megjelölés jóváhagyottként'}
                      >
                        {t.reviewed
                          ? <CheckCircle2 className="h-4 w-4 text-green-500 hover:text-yellow-500 transition-colors cursor-pointer" />
                          : <AlertTriangle className="h-4 w-4 text-yellow-500 hover:text-green-500 transition-colors cursor-pointer" />
                        }
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditDialog(t); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); handleDelete(t); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {expandedId === t.id
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                    </div>

                    {/* Expanded detail — human-readable action names */}
                    {expandedId === t.id && (
                      <div className="px-6 pb-4 bg-muted/10 border-t border-dashed">
                        {t.description && (
                          <p className="text-sm text-muted-foreground mt-3 mb-3 italic">{t.description}</p>
                        )}
                        <div className="space-y-2 mt-3">
                          {(t.visits || []).length > 0 ? (
                            t.visits.map((v, vi) => (
                              <div key={vi} className="flex items-start gap-3">
                                <Badge variant="outline" className="shrink-0 mt-0.5 text-xs font-medium" style={{ borderColor: catColor(t.category) + '40', color: catColor(t.category) }}>
                                  {t.visits.length > 1 ? `${vi + 1}. vizit${v.name ? ': ' + v.name : ''}` : 'Lépések'}
                                </Badge>
                                <div className="flex flex-wrap gap-1.5">
                                  {v.actions.map((a, ai) => (
                                    <span key={ai} className="inline-flex items-center gap-1 text-[12px] bg-primary/8 text-primary border border-primary/15 px-2 py-0.5 rounded-md">
                                      <span className="text-primary/40 font-mono text-[10px]">{ai + 1}.</span>
                                      {actionName(a)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {(t.atomic_actions || []).map((a, ai) => (
                                <span key={ai} className="inline-flex items-center gap-1 text-[12px] bg-primary/8 text-primary border border-primary/15 px-2 py-0.5 rounded-md">
                                  <span className="text-primary/40 font-mono text-[10px]">{ai + 1}.</span>
                                  {actionName(a)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ─── Edit Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingTemplate && (
                <span className="flex items-center gap-2">
                  Protokoll szerkesztése
                  <Badge variant="outline" className="text-xs font-mono font-normal">{editingTemplate.slug}</Badge>
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Megnevezés</Label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kategória</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Leírás</Label>
                <Input value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="Opcionális megjegyzés" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Triggerek <span className="text-muted-foreground">(vesszővel elválasztva — ezek a szavak aktiválják a protokollt)</span></Label>
                <Input value={formTriggers} onChange={e => setFormTriggers(e.target.value)} placeholder="pl. MOD tömés, két felszín, háromfelszínű" />
              </div>

              {/* Visits / actions editor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Kezelési lépések</Label>
                  <Button variant="outline" size="sm" onClick={addVisit} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Vizit hozzáadása
                  </Button>
                </div>

                {formVisits.map((visit, vi) => (
                  <div key={vi} className="border rounded-lg p-3 space-y-2 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: catColor(formCategory) + '40', color: catColor(formCategory) }}>
                        {formVisits.length > 1 ? `${visit.visit}. vizit` : 'Lépések'}
                      </Badge>
                      {formVisits.length > 1 && (
                        <Input
                          value={visit.name || ''}
                          onChange={e => setFormVisits(prev => prev.map((v, i) => i === vi ? { ...v, name: e.target.value } : v))}
                          placeholder="Vizit megnevezés (pl. Preparáció + lenyomat)"
                          className="h-7 text-xs flex-1"
                        />
                      )}
                      {formVisits.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeVisit(vi)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    {visit.actions.map((slug, ai) => (
                      <div
                        key={`${vi}-${ai}`}
                        draggable
                        onDragStart={() => setDragInfo({ visitIdx: vi, actionIdx: ai })}
                        onDragOver={e => { e.preventDefault(); setDragOverInfo({ visitIdx: vi, actionIdx: ai }); }}
                        onDrop={e => {
                          e.preventDefault();
                          if (dragInfo && dragInfo.visitIdx === vi) moveAction(vi, dragInfo.actionIdx, ai);
                          setDragInfo(null);
                          setDragOverInfo(null);
                        }}
                        onDragEnd={() => { setDragInfo(null); setDragOverInfo(null); }}
                        className={cn(
                          "flex items-center gap-2 rounded-md transition-all",
                          dragInfo?.visitIdx === vi && dragInfo?.actionIdx === ai && "opacity-40",
                          dragOverInfo?.visitIdx === vi && dragOverInfo?.actionIdx === ai && dragInfo?.visitIdx === vi && dragInfo?.actionIdx !== ai && "border-t-2 border-primary",
                        )}
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab active:cursor-grabbing shrink-0" />
                        <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{ai + 1}.</span>
                        <Select value={slug} onValueChange={val => updateAction(vi, ai, val)}>
                          <SelectTrigger className="h-8 text-sm flex-1">
                            <SelectValue placeholder="Válasszon akciót...">{slug ? actionName(slug) : 'Válasszon akciót...'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {ATOMIC_ACTION_OPTIONS.map(opt => (
                              <SelectItem key={opt.slug} value={opt.slug}>
                                {opt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {visit.actions.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAction(vi, ai)}>
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}

                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => addAction(vi)}>
                      <Plus className="h-3 w-3 mr-1" /> Lépés hozzáadása
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-4 border-t">
            <div className="flex items-center gap-2 flex-1">
              <Button variant="ghost" size="sm" onClick={resetCurrentToDefault} className="text-xs text-muted-foreground hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Alapbeállítás visszaállítása
              </Button>
            </div>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Mégse</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Mentés
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedCard>
  );
}
