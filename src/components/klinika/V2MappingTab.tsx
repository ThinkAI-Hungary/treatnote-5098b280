import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Pencil, Sparkles, ArrowRight, GitBranch, ChevronDown, Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/useToastMessage';
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
  disabled: boolean;
}

interface SzotarItem {
  id: string;
  name: string;
  category?: string;
}

interface V2MappingTabProps {
  telephelyId: string;
  isStdl?: boolean;
}

// ─── Confidence helpers ──────────────────────────────────────────────────────

function confidenceLabel(c: number): string {
  if (c >= 0.7) return 'Jó';
  if (c >= 0.4) return 'Átnézendő';
  return 'Sürgős';
}

function confidenceBg(c: number): string {
  if (c >= 0.7) return 'bg-green-500/10 border-green-500/20 text-green-600';
  if (c >= 0.4) return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600';
  return 'bg-red-500/10 border-red-500/20 text-red-600';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function V2MappingTab({ telephelyId, isStdl }: V2MappingTabProps) {
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

  // Review card state
  interface ReviewMapping {
    id: string;
    atomic_action_slug: string;
    szotar_kezeles_id: string | null;
    szotar_kezeles_name: string | null;
    confidence: number;
    reviewed: boolean;
  }
  const [reviewMappings, setReviewMappings] = useState<ReviewMapping[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingReviewSzId, setEditingReviewSzId] = useState<string | null>(null);
  const [editingReviewSearch, setEditingReviewSearch] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // ─── Data Loading ────────────────────────────────────────────────────────

  const loadMappings = useCallback(async () => {
    if (!telephelyId) return;
    setLoading(true);
    try {
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const { data, error } = await supabase
        .from(tableName as any)
        .select('*')
        .eq('telephely_id', telephelyId)
        .order('atomic_action_slug');

      if (error) throw error;
      setMappings((data || []) as unknown as V2Mapping[]);
    } catch (err: any) {
      console.error('Error loading V2 mappings:', err);
      toast.error('Hiba a V2 mapping-ek betöltésekor: ' + (err.message || 'Ismeretlen hiba'));
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  const loadSzotar = useCallback(async () => {
    if (!telephelyId) return;
    try {
      const tableName = isStdl ? 'clinic_treatment_items_stdl' : 'szotar_kezelesek';
      const { data, error } = await supabase
        .from(tableName as any)
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

  // ─── Review mappings (non-Jó, unreviewed) ──────────────────────────────

  const loadReviewMappings = useCallback(async () => {
    if (!telephelyId) return;
    try {
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const idCol = isStdl ? 'stdl_treatment_item_id' : 'szotar_kezeles_id';
      const nameCol = isStdl ? 'stdl_treatment_item_name' : 'szotar_kezeles_name';
      
      const { data, error } = await supabase
        .from(tableName as any)
        .select(`id, atomic_action_slug, ${idCol}, ${nameCol}, confidence, reviewed`)
        .eq('telephely_id', telephelyId)
        .eq('reviewed', false)
        .lt('confidence', 0.7)
        .order('confidence');
        
      if (!error && data) {
        // Map to common interface
        const mapped = data.map((d: any) => ({
          id: d.id,
          atomic_action_slug: d.atomic_action_slug,
          szotar_kezeles_id: d[idCol],
          szotar_kezeles_name: d[nameCol],
          confidence: d.confidence,
          reviewed: d.reviewed
        }));
        setReviewMappings(mapped as unknown as ReviewMapping[]);
      }
    } catch { /* ignore */ }
  }, [telephelyId]);

  useEffect(() => { loadReviewMappings(); }, [loadReviewMappings]);

  const handleApproveReview = async (mapping: ReviewMapping, newSzId?: string, newSzName?: string) => {
    setApprovingId(mapping.id);
    try {
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const update: Record<string, unknown> = { reviewed: true, reviewed_at: new Date().toISOString() };
      if (newSzId) {
        if (isStdl) {
          update.stdl_treatment_item_id = newSzId;
          update.stdl_treatment_item_name = newSzName;
        } else {
          update.szotar_kezeles_id = newSzId;
          update.szotar_kezeles_name = newSzName;
        }
        update.confidence = 1.0;
      }
      const { error } = await supabase.from(tableName as any).update(update).eq('id', mapping.id);
      if (error) throw error;
      
      setReviewMappings(prev => prev.filter(m => m.id !== mapping.id));
      setEditingReviewId(null);
      toast.success('Mapping jóváhagyva!');
      loadMappings();
    } catch (err: any) {
      toast.error('Hiba a mentés során: ' + (err.message || ''));
    } finally {
      setApprovingId(null);
    }
  };

  const handleApproveAllReview = async () => {
    setApprovingId('all');
    try {
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      for (const m of reviewMappings) {
        const { error } = await supabase.from(tableName as any)
          .update({ reviewed: true, reviewed_at: new Date().toISOString() })
          .eq('id', m.id);
        if (error) throw error;
      }
      setReviewMappings([]);
      toast.success(`${reviewMappings.length} mapping jóváhagyva!`);
      loadMappings();
    } catch (err: any) {
      toast.error('Hiba az összes jóváhagyásakor: ' + (err.message || ''));
    } finally {
      setApprovingId(null);
    }
  };

  const filteredReviewSzotar = useMemo(() => {
    if (!editingReviewSearch) return szotarItems.slice(0, 30);
    const q = editingReviewSearch.toLowerCase();
    return szotarItems.filter(s => s.name.toLowerCase().includes(q)).slice(0, 30);
  }, [szotarItems, editingReviewSearch]);

  // ─── Run onboarding with progress polling ─────────────────────────────

  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollStartRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      // 5-minute safety timeout
      if (Date.now() - pollStartRef.current > 5 * 60 * 1000) {
        stopPolling();
        setOnboardingRunning(false);
        setProgressPct(null);
        setProgressMsg('');
        toast.error('Mapping pipeline időtúllépés — ellenőrizze a szótár állapotát és próbálja újra.');
        return;
      }

      try {
        const funcName = isStdl ? 'v2-onboarding-stdl' : 'v2-onboarding';
        const { data } = await supabase.functions.invoke(funcName, {
          body: { operation: 'check-status', telephelyId },
        });
        if (!data) return;

        if (data.status === 'running') {
          setProgressPct(data.details?.progress_percent ?? 0);
          setProgressMsg(data.details?.progress_message ?? 'Folyamatban...');

          // Stale detection: if still "running" but no progress_percent after 60s, it likely crashed
          const startedAt = data.details?.onboarding_started_at;
          if (startedAt && !data.details?.progress_percent) {
            const elapsed = Date.now() - new Date(startedAt).getTime();
            if (elapsed > 60_000) {
              stopPolling();
              setOnboardingRunning(false);
              setProgressPct(null);
              setProgressMsg('');
              toast.error('A pipeline nem indult el — ellenőrizze, hogy van-e szótár a telephelyhez.');
              return;
            }
          }
        } else if (data.status === 'completed') {
          setProgressPct(100);
          setProgressMsg('Kész!');
          stopPolling();
          setOnboardingRunning(false);
          toast.success('Mapping pipeline elkészült!');
          setTimeout(() => {
            setProgressPct(null);
            setProgressMsg('');
            loadMappings();
          }, 1500);
        } else if (data.status === 'error') {
          stopPolling();
          setOnboardingRunning(false);
          setProgressPct(null);
          setProgressMsg('');
          toast.error('Hiba a mapping pipeline-ban: ' + (data.details?.onboarding_error || 'Ismeretlen'));
        } else {
          // Status is 'not_started' or unknown — pipeline didn't start
          stopPolling();
          setOnboardingRunning(false);
          setProgressPct(null);
          setProgressMsg('');
        }
      } catch { /* retry on next tick */ }
    }, 3000);
  }, [telephelyId, stopPolling, loadMappings]);

  // Check if pipeline is already running on mount
  useEffect(() => {
    if (!telephelyId) return;
    (async () => {
      try {
        const funcName = isStdl ? 'v2-onboarding-stdl' : 'v2-onboarding';
        const { data } = await supabase.functions.invoke(funcName, {
          body: { operation: 'check-status', telephelyId },
        });
        if (data?.status === 'running') {
          setOnboardingRunning(true);
          setProgressPct(data.details?.progress_percent ?? 0);
          setProgressMsg(data.details?.progress_message ?? 'Folyamatban...');
          startPolling();
        }
      } catch { /* ignore */ }
    })();
    return () => stopPolling();
  }, [telephelyId, startPolling, stopPolling]);

  const runOnboarding = async () => {
    setOnboardingRunning(true);
    setProgressPct(0);
    setProgressMsg('Pipeline indítása...');
    try {
      const funcName = isStdl ? 'v2-onboarding-stdl' : 'v2-onboarding';
      const { data, error } = await supabase.functions.invoke(funcName, {
        body: { operation: 'run-mapping', telephelyId },
      });
      if (error) throw error;
      startPolling();
    } catch (err: any) {
      toast.error('Hiba: ' + (err.message || ''));
      setOnboardingRunning(false);
      setProgressPct(null);
      setProgressMsg('');
    }
  };

  const [variantsRunning, setVariantsRunning] = useState(false);
  const runVariantSeeding = async () => {
    setVariantsRunning(true);
    try {
      const funcName = isStdl ? 'v2-onboarding-stdl' : 'v2-onboarding';
      const response = await supabase.functions.invoke(funcName, {
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
        (confidenceFilter === 'jo' && r.generic.confidence >= 0.7) ||
        (confidenceFilter === 'atnezendo' && r.generic.confidence >= 0.4 && r.generic.confidence < 0.7) ||
        (confidenceFilter === 'surgos' && r.generic.confidence < 0.4) ||
        (confidenceFilter === 'reviewed' && r.generic.reviewed) ||
        (confidenceFilter === 'unreviewed' && !r.generic.reviewed) ||
        (confidenceFilter === 'disabled' && r.generic.disabled) ||
        (confidenceFilter === 'enabled' && !r.generic.disabled);
      return matchesSearch && matchesConf;
    });
  }, [slugRows, searchTerm, confidenceFilter]);

  const stats = useMemo(() => ({
    total: slugRows.length,
    variants: mappings.length - slugRows.length,
    jo: slugRows.filter(r => r.generic.confidence >= 0.7).length,
    atnezendo: slugRows.filter(r => r.generic.confidence >= 0.4 && r.generic.confidence < 0.7).length,
    surgos: slugRows.filter(r => r.generic.confidence < 0.4).length,
    reviewed: slugRows.filter(r => r.generic.reviewed).length,
    disabled: slugRows.filter(r => r.generic.disabled).length,
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
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const updateData: any = {
        confidence: 1.0,
        reviewed: true,
        reviewed_at: new Date().toISOString(),
      };
      
      if (isStdl) {
        updateData.stdl_treatment_item_id = szId;
        updateData.stdl_treatment_item_name = szName;
      } else {
        updateData.szotar_kezeles_id = szId;
        updateData.szotar_kezeles_name = szName;
      }

      const { error } = await supabase
        .from(tableName as any)
        .update(updateData)
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
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const { error } = await supabase
        .from(tableName as any)
        .update({ reviewed: newVal, reviewed_at: newVal ? new Date().toISOString() : null })
        .eq('id', mapping.id);
      if (error) throw error;
    } catch {
      toast.error('Hiba');
      loadMappings();
    }
  };

  const handleToggleDisabled = async (mapping: V2Mapping, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !mapping.disabled;
    // Optimistic update
    setMappings(prev => prev.map(m => m.id === mapping.id ? { ...m, disabled: newVal } : m));
    try {
      const tableName = isStdl ? 'v2_clinic_mappings_stdl' : 'v2_clinic_mappings';
      const { error } = await supabase
        .from(tableName as any)
        .update({ disabled: newVal })
        .eq('id', mapping.id);
      if (error) throw error;
    } catch {
      toast.error('Hiba a státusz módosításakor');
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
            <Button size="sm" onClick={runOnboarding} disabled={onboardingRunning}>
              {onboardingRunning ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Mapping futtatása
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {progressPct !== null && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{progressMsg}</span>
              <span className="font-mono font-medium text-primary">{progressPct}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-600">
            🟢 {stats.jo} Jó
          </Badge>
          <Badge variant="outline" className="bg-yellow-500/10 border-yellow-500/20 text-yellow-600">
            🟡 {stats.atnezendo} Átnézendő
          </Badge>
          <Badge variant="outline" className="bg-red-500/10 border-red-500/20 text-red-600">
            🔴 {stats.surgos} Sürgős
          </Badge>
          <Badge variant="outline" className="bg-blue-500/10 border-blue-500/20 text-blue-500">
            ✓ {stats.reviewed} Ellenőrzött
          </Badge>
        </div>

        {/* Collapsible review section */}
        {reviewMappings.length > 0 && (
          <div className="mt-4 border rounded-lg overflow-hidden">
            <button
              onClick={() => setReviewOpen(!reviewOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Átnézésre váró mapping-ek</span>
                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                  {reviewMappings.length}
                </Badge>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', reviewOpen && 'rotate-180')} />
            </button>
            {reviewOpen && (
              <div>
                <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
                  <span className="text-xs text-muted-foreground">Ezek az automata hozzárendelések nem egyértelműek. Kérjük, ellenőrizze vagy javítsa őket.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleApproveAllReview}
                    disabled={approvingId === 'all'}
                    className="gap-1.5 h-7 text-xs shrink-0"
                  >
                    {approvingId === 'all' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Összes jóváhagyása
                  </Button>
                </div>
                <ScrollArea className={reviewMappings.length > 6 ? 'h-[360px]' : undefined}>
                  <div className="divide-y">
                    {reviewMappings.map(m => (
                      <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                        <div className="w-[180px] shrink-0">
                          <span className="text-sm font-medium">{actionName(m.atomic_action_slug)}</span>
                          <span className="block text-[10px] text-muted-foreground font-mono">{m.atomic_action_slug}</span>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {editingReviewId === m.id ? (
                          <div className="flex-1 space-y-1.5">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Keresés a szótárban..."
                                value={editingReviewSearch}
                                onChange={e => setEditingReviewSearch(e.target.value)}
                                className="h-8 pl-8 text-xs"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-32 overflow-y-auto border rounded-md">
                              {filteredReviewSzotar.map(sz => (
                                <button
                                  key={sz.id}
                                  onClick={() => setEditingReviewSzId(sz.id)}
                                  className={cn(
                                    'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors',
                                    editingReviewSzId === sz.id && 'bg-primary/10 text-primary'
                                  )}
                                >
                                  {sz.name}
                                  {sz.category && <span className="text-muted-foreground ml-1.5">[{sz.category}]</span>}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm" className="h-7 text-xs"
                                disabled={!editingReviewSzId || approvingId === m.id}
                                onClick={() => {
                                  const sz = szotarItems.find(s => s.id === editingReviewSzId);
                                  if (sz) handleApproveReview(m, sz.id, sz.name);
                                }}
                              >
                                {approvingId === m.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                                Mentés
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingReviewId(null); setEditingReviewSzId(null); setEditingReviewSearch(''); }}>
                                Mégse
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate block">{m.szotar_kezeles_name || '—'}</span>
                          </div>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 shrink-0',
                            confidenceBg(m.confidence)
                          )}
                        >
                          {confidenceLabel(m.confidence)}
                        </Badge>
                        {editingReviewId !== m.id && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingReviewId(m.id); setEditingReviewSzId(null); setEditingReviewSearch(''); }} title="Szótár tétel módosítása">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleApproveReview(m)} disabled={approvingId === m.id} title="Jóváhagyás">
                              {approvingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

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
              <SelectItem value="jo">🟢 Jó</SelectItem>
              <SelectItem value="atnezendo">🟡 Átnézendő</SelectItem>
              <SelectItem value="surgos">🔴 Sürgős</SelectItem>
              <SelectItem value="reviewed">✓ Ellenőrzött</SelectItem>
              <SelectItem value="unreviewed">✗ Nem ellenőrzött</SelectItem>
              <SelectItem value="disabled">⏸ Kikapcsolt</SelectItem>
              <SelectItem value="enabled">▶ Aktív</SelectItem>
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
                      row.generic.disabled && "opacity-50",
                      !row.generic.reviewed && row.generic.confidence < 0.4 && !row.generic.disabled && "bg-red-500/5"
                    )}
                    onClick={() => openEditDialog(row)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm", row.generic.disabled && "line-through text-muted-foreground")}>{actionName(row.slug)}</span>
                          {row.variants.length > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-purple-500/10 border-purple-500/20 text-purple-600">
                              {row.variants.length} variáns
                            </Badge>
                          )}
                          {row.generic.disabled && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-gray-500/10 border-gray-500/20 text-gray-500">
                              kikapcsolva
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
                      <Badge variant="outline" className={cn("text-xs", confidenceBg(row.generic.confidence))}>
                        {confidenceLabel(row.generic.confidence)}
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 transition-all",
                            row.generic.disabled
                              ? "text-gray-400 hover:text-green-600 hover:bg-green-50 opacity-100"
                              : "text-green-600 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                          )}
                          onClick={e => handleToggleDisabled(row.generic, e)}
                          title={row.generic.disabled ? 'Bekapcsolás' : 'Kikapcsolás'}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => { e.stopPropagation(); openEditDialog(row); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
                          <Badge variant="outline" className={cn("text-[10px] shrink-0", confidenceBg(v.confidence))}>
                            {confidenceLabel(v.confidence)}
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

