import { useState, useEffect, useCallback, useMemo } from 'react';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Pencil, Sparkles, ArrowRight, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AnimatedCard } from './AnimatedCard';
import { actionName } from '@/lib/atomicActionNames';

// ─── Types ───────────────────────────────────────────────────────────────────

interface V2Mapping {
  id: string;
  telephely_id: string;
  atomic_action_slug: string;
  szotar_kezeles_id: string | null;
  szotar_kezeles_name: string | null;
  conditions: Record<string, unknown>;
  confidence: number;
  reviewed: boolean;
  reviewed_at: string | null;
  created_at: string;
}

interface SzotarItem {
  id: string;
  name: string;
  category?: string;
}

interface V2MappingTabProps {
  telephelyId: string;
}

// ─── Confidence helpers ──────────────────────────────────────────────────────

function confidenceColor(c: number): string {
  if (c >= 0.8) return 'text-green-500';
  if (c >= 0.5) return 'text-yellow-500';
  return 'text-red-500';
}

function confidenceBg(c: number): string {
  if (c >= 0.8) return 'bg-green-500/10 border-green-500/20 text-green-500';
  if (c >= 0.5) return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500';
  return 'bg-red-500/10 border-red-500/20 text-red-500';
}

function confidenceLevel(c: number): string {
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function V2MappingTab({ telephelyId }: V2MappingTabProps) {
  const [mappings, setMappings] = useState<V2Mapping[]>([]);
  const [szotarItems, setSzotarItems] = useState<SzotarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [onboardingRunning, setOnboardingRunning] = useState(false);

  // Edit dialog state
  const [editMapping, setEditMapping] = useState<V2Mapping | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSearch, setDialogSearch] = useState('');
  const [selectedSzotarId, setSelectedSzotarId] = useState<string | null>(null);
  const [selectedSzotarName, setSelectedSzotarName] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadMappings = useCallback(async () => {
    if (!telephelyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v2_clinic_mappings' as any)
        .select('*')
        .eq('telephely_id', telephelyId)
        .order('atomic_action_slug');

      if (error) throw error;
      setMappings((data || []) as unknown as V2Mapping[]);
    } catch (err: any) {
      console.error('Error loading V2 mappings:', err);
      toast.error('Hiba a V2 mapping-ek betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  const loadSzotar = useCallback(async () => {
    if (!telephelyId) return;
    try {
      const { data, error } = await supabase
        .from('szotar_kezelesek' as any)
        .select('id, name, category')
        .eq('telephely_id', telephelyId)
        .order('name')
        .limit(5000);

      if (error) throw error;
      setSzotarItems((data || []) as unknown as SzotarItem[]);
    } catch (err: any) {
      console.error('Error loading szótár:', err);
    }
  }, [telephelyId]);

  useEffect(() => { loadMappings(); loadSzotar(); }, [loadMappings, loadSzotar]);

  // ─── Run onboarding ──────────────────────────────────────────────────────

  const runOnboarding = async () => {
    setOnboardingRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('v2-onboarding', {
        body: { operation: 'run-mapping', telephelyId },
      });
      if (error) throw error;
      toast.success('V2 mapping pipeline elindult a háttérben. Néhány perc múlva frissítsen.');
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
    } finally {
      setOnboardingRunning(false);
    }
  };

  const [variantsRunning, setVariantsRunning] = useState(false);
  const runVariantSeeding = async () => {
    setVariantsRunning(true);
    try {
      const response = await supabase.functions.invoke('v2-onboarding', {
        body: { operation: 'seed-variants', telephelyId },
      });
      if (response.error) throw response.error;
      toast.success('Variánsok generálása elindult. Frissítsen 2 perc múlva.');
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
    } finally {
      setVariantsRunning(false);
    }
  };

  // ─── Grouping & Filtering ────────────────────────────────────────────────

  // Group all mappings by slug
  const grouped = useMemo(() => {
    const map = new Map<string, V2Mapping[]>();
    for (const m of mappings) {
      const arr = map.get(m.atomic_action_slug) || [];
      arr.push(m);
      map.set(m.atomic_action_slug, arr);
    }
    // Sort: generic first, then variants
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const aHasCond = Object.keys(a.conditions || {}).length > 0;
        const bHasCond = Object.keys(b.conditions || {}).length > 0;
        if (aHasCond !== bHasCond) return aHasCond ? 1 : -1;
        return 0;
      });
    }
    return map;
  }, [mappings]);

  // One row per slug
  const slugRows = useMemo(() => {
    const rows: { slug: string; generic: V2Mapping; variants: V2Mapping[]; all: V2Mapping[] }[] = [];
    for (const [slug, all] of grouped) {
      const generic = all.find(m => Object.keys(m.conditions || {}).length === 0) || all[0];
      const variants = all.filter(m => Object.keys(m.conditions || {}).length > 0);
      rows.push({ slug, generic, variants, all });
    }
    return rows;
  }, [grouped]);

  const filteredRows = useMemo(() => {
    return slugRows.filter(r => {
      const matchesSearch = !searchTerm ||
        r.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.all.some(m => (m.szotar_kezeles_name || '').toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesConf = confidenceFilter === 'all' ||
        (confidenceFilter === 'high' && r.generic.confidence >= 0.8) ||
        (confidenceFilter === 'medium' && r.generic.confidence >= 0.5 && r.generic.confidence < 0.8) ||
        (confidenceFilter === 'low' && r.generic.confidence < 0.5) ||
        (confidenceFilter === 'reviewed' && r.generic.reviewed) ||
        (confidenceFilter === 'unreviewed' && !r.generic.reviewed);
      return matchesSearch && matchesConf;
    });
  }, [slugRows, searchTerm, confidenceFilter]);

  const stats = useMemo(() => ({
    total: slugRows.length,
    variants: mappings.length - slugRows.length,
    high: slugRows.filter(r => r.generic.confidence >= 0.8).length,
    medium: slugRows.filter(r => r.generic.confidence >= 0.5 && r.generic.confidence < 0.8).length,
    low: slugRows.filter(r => r.generic.confidence < 0.5).length,
    reviewed: slugRows.filter(r => r.generic.reviewed).length,
  }), [slugRows, mappings]);

  // ─── Edit dialog (multi-variant) ────────────────────────────────────────

  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editVariants, setEditVariants] = useState<V2Mapping[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);

  const openEditDialog = (row: { slug: string; all: V2Mapping[] }) => {
    setEditSlug(row.slug);
    setEditVariants([...row.all]);
    setActiveVariantId(row.all[0]?.id || null);
    setDialogSearch('');
    setSelectedSzotarId(null);
    setSelectedSzotarName('');
    setDialogOpen(true);
  };

  const activeVariant = editVariants.find(v => v.id === activeVariantId) || null;

  const dialogFilteredSzotar = useMemo(() => {
    if (!dialogSearch) return szotarItems.slice(0, 50);
    return szotarItems.filter(i =>
      i.name.toLowerCase().includes(dialogSearch.toLowerCase())
    ).slice(0, 50);
  }, [szotarItems, dialogSearch]);

  const handleSaveVariant = async (variantId: string, szId: string, szName: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('v2_clinic_mappings' as any)
        .update({
          szotar_kezeles_id: szId,
          szotar_kezeles_name: szName,
          confidence: 1.0,
          reviewed: true,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', variantId);

      if (error) throw error;
      setEditVariants(prev => prev.map(v => v.id === variantId ? { ...v, szotar_kezeles_id: szId, szotar_kezeles_name: szName, confidence: 1.0, reviewed: true } : v));
      setMappings(prev => prev.map(m => m.id === variantId ? { ...m, szotar_kezeles_id: szId, szotar_kezeles_name: szName, confidence: 1.0, reviewed: true, reviewed_at: new Date().toISOString() } : m));
      toast.success('Mentve');
      setSelectedSzotarId(null);
      setSelectedSzotarName('');
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReviewed = async (mapping: V2Mapping) => {
    const newVal = !mapping.reviewed;
    setMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, reviewed: newVal, reviewed_at: newVal ? new Date().toISOString() : null } : m));
    try {
      const { error } = await supabase
        .from('v2_clinic_mappings' as any)
        .update({ reviewed: newVal, reviewed_at: newVal ? new Date().toISOString() : null })
        .eq('id', mapping.id);
      if (error) throw error;
    } catch {
      toast.error('Hiba');
      loadMappings();
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const formatConditions = (c: Record<string, unknown>) => {
    const entries = Object.entries(c);
    if (entries.length === 0) return 'alap';
    const labels: Record<string, string> = {
      canal_count: 'csatorna',
      tooth_region: 'fogterület',
      brand: 'márka',
      material: 'anyag',
      type: 'típus',
      method: 'módszer',
    };
    return entries.map(([k, v]) => `${labels[k] || k}: ${v}`).join(', ');
  };

  return (
    <AnimatedCard>
      <CardHeader className="pb-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="text-xl flex items-center gap-2">
            V2 Engine Mapping
            <Badge variant="secondary" className="ml-2 text-xs">{stats.total} akció</Badge>
            {stats.variants > 0 && <Badge variant="outline" className="text-xs">{stats.variants} variáns</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadMappings()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Frissítés
            </Button>
            <Button variant="outline" size="sm" onClick={runVariantSeeding} disabled={variantsRunning}>
              {variantsRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <GitBranch className="h-4 w-4 mr-1.5" />}
              Variánsok
            </Button>
            <Button size="sm" onClick={runOnboarding} disabled={onboardingRunning}>
              {onboardingRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Mapping futtatása
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-500">
            🟢 {stats.high} high
          </Badge>
          <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/20 text-yellow-500">
            🟡 {stats.medium} medium
          </Badge>
          <Badge variant="outline" className="bg-red-500/10 border-red-500/20 text-red-500">
            🔴 {stats.low} low
          </Badge>
          <Badge variant="outline" className="bg-blue-500/10 border-blue-500/20 text-blue-500">
            ✓ {stats.reviewed} reviewed
          </Badge>
        </div>

        {/* Search & filter */}
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Keresés..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Szűrő" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Összes</SelectItem>
              <SelectItem value="high">🟢 High ≥0.8</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🔴 Low &lt;0.5</SelectItem>
              <SelectItem value="reviewed">✓ Reviewed</SelectItem>
              <SelectItem value="unreviewed">✗ Unreviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : slugRows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-lg font-medium">Nincs V2 mapping</p>
            <p className="text-sm mt-1">Kattintson a "Mapping futtatása" gombra.</p>
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '300px' }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 sticky top-0 z-10">
                  <TableHead className="w-[280px]">Atomi akció</TableHead>
                  <TableHead className="w-[350px]">Szótár tétel</TableHead>
                  <TableHead className="text-center w-[80px]">Conf.</TableHead>
                  <TableHead className="text-center w-[80px]">Státusz</TableHead>
                  <TableHead className="text-right w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map(row => (
                  <TableRow
                    key={row.slug}
                    className={cn(
                      "group transition-colors cursor-pointer",
                      !row.generic.reviewed && row.generic.confidence < 0.5 && "bg-red-500/5"
                    )}
                    onClick={() => openEditDialog(row)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{actionName(row.slug)}</span>
                          {row.variants.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-500/10 border-purple-500/20 text-purple-600">
                              {row.variants.length} variáns
                            </Badge>
                          )}
                        </div>
                        <code className="text-[10px] font-mono text-muted-foreground">{row.slug}</code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        {row.variants.length > 0 ? (
                          <span className="text-sm text-purple-600">Több variáns</span>
                        ) : (
                          <span className={cn("text-sm truncate max-w-[300px]", !row.generic.szotar_kezeles_name && "text-muted-foreground italic")}>
                            {row.generic.szotar_kezeles_name || 'Nincs párosítva'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={cn("text-xs font-mono", confidenceBg(row.generic.confidence))}>
                        {(row.generic.confidence * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleReviewed(row.generic); }}
                        className="mx-auto block"
                        title={row.generic.reviewed ? 'Jóváhagyás visszavonása' : 'Megjelölés jóváhagyottként'}
                      >
                        {row.generic.reviewed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 hover:text-yellow-500 transition-colors cursor-pointer" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 hover:text-green-500 transition-colors cursor-pointer" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => { e.stopPropagation(); openEditDialog(row); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* ─── Edit Mapping Dialog (multi-variant) ──────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {editSlug && actionName(editSlug)}
              <code className="text-xs font-mono text-muted-foreground font-normal">{editSlug}</code>
            </DialogTitle>
          </DialogHeader>

          {editSlug && (
            <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 py-2" style={{ minHeight: '400px' }}>
              {/* LEFT: Variant rows */}
              <div className="flex flex-col gap-1 overflow-y-auto border rounded-lg p-2">
                <div className="text-xs text-muted-foreground font-medium px-1 pb-1 border-b mb-1">Variánsok</div>
                {editVariants.map(v => {
                  const isActive = v.id === activeVariantId;
                  const condLabel = formatConditions(v.conditions || {});
                  return (
                    <div
                      key={v.id}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors",
                        isActive ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/30"
                      )}
                      onClick={() => { setActiveVariantId(v.id); setDialogSearch(''); setSelectedSzotarId(null); }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge variant="outline" className="text-[10px] shrink-0">{condLabel}</Badge>
                          <Badge variant="outline" className={cn("text-[10px] font-mono shrink-0", confidenceBg(v.confidence))}>
                            {(v.confidence * 100).toFixed(0)}%
                          </Badge>
                          {v.reviewed
                            ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            : <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
                          }
                        </div>
                        <span className={cn("text-xs leading-tight line-clamp-2", !v.szotar_kezeles_name && "text-muted-foreground italic")}>
                          {v.szotar_kezeles_name || 'Nincs párosítva'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* RIGHT: Szótár picker */}
              <div className="flex flex-col gap-2 overflow-hidden">
                {activeVariant ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      Szótár tétel: <strong>{formatConditions(activeVariant.conditions || {})}</strong>
                    </div>

                    <div className="relative shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Keresés..."
                        value={dialogSearch}
                        onChange={e => setDialogSearch(e.target.value)}
                        className="pl-9 h-8 text-sm"
                        autoFocus
                      />
                    </div>

                    <div className="flex-1 min-h-0 border rounded-lg overflow-y-auto">
                      <div className="p-1">
                        {dialogFilteredSzotar.map(item => (
                          <button
                            key={item.id}
                            className={cn(
                              "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors",
                              selectedSzotarId === item.id
                                ? "bg-primary/15 text-primary font-medium"
                                : item.id === activeVariant.szotar_kezeles_id
                                  ? "bg-green-500/5"
                                  : "hover:bg-muted/50"
                            )}
                            onClick={() => { setSelectedSzotarId(item.id); setSelectedSzotarName(item.name); }}
                          >
                            <span>{item.name}</span>
                            {item.id === activeVariant.szotar_kezeles_id && (
                              <span className="ml-2 text-[10px] text-green-600">JELENLEGI</span>
                            )}
                          </button>
                        ))}
                        {dialogFilteredSzotar.length === 0 && (
                          <div className="text-center py-6 text-muted-foreground text-sm">Nincs találat</div>
                        )}
                      </div>
                    </div>

                    {selectedSzotarId && (
                      <Button
                        size="sm"
                        className="self-end"
                        onClick={() => handleSaveVariant(activeVariant.id, selectedSzotarId!, selectedSzotarName)}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                        Mentés
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Válasszon egy variánst
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Bezárás</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedCard>
  );
}

