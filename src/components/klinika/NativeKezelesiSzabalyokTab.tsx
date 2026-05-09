import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Tag,
  Clock,
  Filter,
  FileUp,
  RefreshCw,
  Flag,
  Power,
  Link2,
  ArrowUp,
  ArrowDown,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { AnimatedCard } from './AnimatedCard';
import { TreatmentRuleEditor } from './TreatmentRuleEditor';
import { toast } from '@/hooks/useToastMessage';
import { supabase } from '@/integrations/supabase/client';
import { TreatmentRule, RuleVisit, RuleItem, CATEGORY_OPTIONS } from '@/types/treatmentRules';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCachedRoles } from '@/hooks/useCachedRoles';
import { useTheme } from '@/components/ThemeProvider';
import { notifyRulesDataChanged } from '@/lib/rulesEvents';
import { useSzotar } from '@/hooks/useSzotar';

// --- Sort helpers ---
type SortColumn = 'name' | 'category' | 'visits' | 'items' | 'created_at';
type SortDir = 'asc' | 'desc';

interface KezelesiSzabalyokTabProps {
  companyId: string;
  telephelyId: string;
  companyName: string;
  telephelyName: string;
}

// --- Linked pair helpers ---
/** Given a rule name, return the base name it's derived from (strip " (SZERKESZTETT)") */
function getBaseName(name: string): string {
  return name.replace(/\s*\(SZERKESZTETT\)\s*$/, '');
}

/** Find the linked counterpart of a rule (base ↔ edited) */
function findLinkedRule(rule: TreatmentRule, allRules: TreatmentRule[]): TreatmentRule | undefined {
  if (rule.name.includes('(SZERKESZTETT)')) {
    // This is an edited copy → find its base rule
    const baseName = getBaseName(rule.name);
    return allRules.find(r => r.id !== rule.id && r.alapszabaly && r.name === baseName);
  }
  if (rule.alapszabaly) {
    // This is a base rule → find its edited copy
    return allRules.find(r => r.id !== rule.id && r.name === `${rule.name} (SZERKESZTETT)`);
  }
  return undefined;
}

// Module-level cache for treatment rules
let rulesCache: {
  telephelyId: string | null;
  rules: TreatmentRule[];
  loaded: boolean;
} = { telephelyId: null, rules: [], loaded: false };

export function NativeKezelesiSzabalyokTab({
  companyId,
  telephelyId,
  companyName,
  telephelyName
}: KezelesiSzabalyokTabProps) {
  const { user } = useAuth();
  const { isAdmin, isKlinikaAdmin } = useCachedRoles();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { addNotification } = useNotifications();
  const { hasSzotar, isLoading: szotarLoading } = useSzotar();

  // Invalidate cache if telephely changed
  if (telephelyId !== rulesCache.telephelyId) {
    rulesCache = { telephelyId, rules: [], loaded: false };
  }

  const hasCachedRules = rulesCache.loaded && rulesCache.telephelyId === telephelyId;
  const [rules, setRules] = useState<TreatmentRule[]>(hasCachedRules ? rulesCache.rules : []);
  const [loading, setLoading] = useState(!hasCachedRules);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'upload'>('list');

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>(() => {
    return (localStorage.getItem('ksz-sort-col') as SortColumn) || 'name';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    return (localStorage.getItem('ksz-sort-dir') as SortDir) || 'asc';
  });

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TreatmentRule | null>(null);
  const [originalRuleIdToDeactivate, setOriginalRuleIdToDeactivate] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteAnchorPosition, setDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  // Bulk delete confirmation state
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteAnchorPosition, setBulkDeleteAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Linked-pair toggle warning state
  const [linkedToggleConfirmOpen, setLinkedToggleConfirmOpen] = useState(false);
  const [pendingToggleRule, setPendingToggleRule] = useState<TreatmentRule | null>(null);
  const [pendingToggleLinked, setPendingToggleLinked] = useState<TreatmentRule | null>(null);

  // Activate rule with inactive items warning state
  const [activateWarningOpen, setActivateWarningOpen] = useState(false);
  const [pendingActivationRule, setPendingActivationRule] = useState<TreatmentRule | null>(null);
  const [inactiveItemsToActivate, setInactiveItemsToActivate] = useState<{ id: string; name: string }[]>([]);

  // Upload state
  const [uploading, setUploading] = useState(false);

  // Generate from dictionary state
  const [generating, setGenerating] = useState(false);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // --- Data Loading ---
  const [dbCustomCategories, setDbCustomCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!telephelyId) return;
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
  }, [telephelyId]);

  // Count total items across all visits
  const countTotalItems = (rule: TreatmentRule): number => {
    return rule.visits?.reduce((sum, visit) => sum + (visit.items?.length || 0), 0) || 0;
  };

  const availableCategories = useMemo(() => {
    const custom = rules.map(r => r.category).filter(Boolean) as string[];
    return Array.from(new Set([...CATEGORY_OPTIONS, ...dbCustomCategories, ...custom])).sort((a, b) => a.localeCompare(b, 'hu'));
  }, [rules, dbCustomCategories]);

  // Helper: update rules state + cache in one shot (for optimistic updates)
  const updateRulesState = useCallback((updater: (prev: TreatmentRule[]) => TreatmentRule[]) => {
    setRules(prev => {
      const next = updater(prev);
      rulesCache = { telephelyId: telephelyId!, rules: next, loaded: true };
      return next;
    });
  }, [telephelyId]);

  // Load rules with visits and items
  const loadRules = useCallback(async () => {
    if (!telephelyId) return;

    // Only show loading spinner if we don't already have cached data
    if (!rulesCache.loaded || rulesCache.telephelyId !== telephelyId) {
      setLoading(true);
    }
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('treatment_rules_stdl')
        .select('*')
        .eq('clinic_id', telephelyId)
        .order('created_at', { ascending: false });

      if (rulesError) throw rulesError;

      const rulesWithDetails: TreatmentRule[] = [];

      for (const rule of rulesData || []) {
        const { data: visitsData, error: visitsError } = await supabase
          .from('rule_visits_stdl')
          .select('*')
          .eq('rule_id', rule.id)
          .order('display_order');

        if (visitsError) throw visitsError;

        const visitsWithItems: RuleVisit[] = [];

        for (const visit of visitsData || []) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('rule_items_stdl')
            .select('*')
            .eq('visit_id', visit.id)
            .order('display_order');

          if (itemsError) throw itemsError;

          visitsWithItems.push({
            ...visit,
            items: (itemsData || []) as RuleItem[],
          });
        }

        rulesWithDetails.push({
          ...rule,
          visits: visitsWithItems,
        });
      }
      
      // Auto-deactivate broken active rules
      const activeRules = rulesWithDetails.filter(r => r.aktiv);
      const brokenRuleIds = new Set<string>();
      
      for (const rule of activeRules) {
        const allItems = rule.visits?.flatMap(v => v.items) || [];
        if (allItems.some(i => !i.item_id)) {
          brokenRuleIds.add(rule.id!);
        }
      }

      // Collect all mapped item ids from active rules
      const mappedItemIds = activeRules
        .flatMap(r => r.visits?.flatMap(v => v.items) || [])
        .map(i => i.item_id)
        .filter(Boolean) as string[];

      if (mappedItemIds.length > 0) {
        // We only check for missing price/name/category here. 
        // Inactive items are handled by the existing deactivation cascade, but we can catch them here too.
        const { data: dbItems } = await supabase
          .from('clinic_treatment_items_stdl')
          .select('id, name, category, price, is_active')
          .in('id', mappedItemIds);

        if (dbItems) {
          const invalidItemIds = new Set(
            dbItems
              .filter(i => !i.name || !i.category || i.price === null || i.price === undefined || !i.is_active)
              .map(i => i.id)
          );

          if (invalidItemIds.size > 0) {
            for (const rule of activeRules) {
              const allItems = rule.visits?.flatMap(v => v.items) || [];
              if (allItems.some(i => i.item_id && invalidItemIds.has(i.item_id))) {
                brokenRuleIds.add(rule.id!);
              }
            }
          }
        }
      }

      let finalRules = rulesWithDetails;
      if (brokenRuleIds.size > 0) {
        const idsToDeactivate = Array.from(brokenRuleIds);
        
        // Update DB
        await supabase
          .from('treatment_rules_stdl')
          .update({ aktiv: false })
          .in('id', idsToDeactivate);

        // Update local state
        finalRules = rulesWithDetails.map(r => 
          brokenRuleIds.has(r.id!) ? { ...r, aktiv: false } : r
        );
        
        toast.error(`${idsToDeactivate.length} szabály automatikusan inaktiválva lett, mert hiányzó szótári elemet vagy hiányos adatot tartalmazott!`);
      }

      setRules(finalRules);
      // Update cache
      rulesCache = { telephelyId: telephelyId!, rules: finalRules, loaded: true };
    } catch (err: any) {
      console.error('Error loading rules:', err);
      toast.error('Hiba a szabályok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => {
    // Always fetch latest data on mount.
    // If we have cached data, loadRules will fetch silently in the background.
    loadRules();
  }, [loadRules, telephelyId]);

  // --- Supabase Realtime: subscribe to treatment_rules INSERT events ---
  useEffect(() => {
    if (!telephelyId) return;

    const channel = supabase
      .channel(`treatment_rules_stdl_realtime_${telephelyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'treatment_rules_stdl',
          filter: `clinic_id=eq.${telephelyId}`,
        },
        async (payload: any) => {
          if (payload.eventType === 'DELETE') {
            updateRulesState(prev => prev.filter(r => r.id !== payload.old.id));
            return;
          }

          if (payload.eventType === 'UPDATE') {
            updateRulesState(prev => prev.map(r => 
              r.id === payload.new.id ? { ...r, ...payload.new } : r
            ));
            return;
          }

          if (payload.eventType === 'INSERT') {
            // Helper to fetch a rule with its visits + items
            const fetchRuleWithDetails = async (ruleId: string) => {
              const { data, error } = await supabase
                .from('treatment_rules_stdl')
                .select(`
                  *,
                  visits:rule_visits(
                    *,
                    items:rule_items(*)
                  )
                `)
                .eq('id', ruleId)
                .single();
              return { data, error };
            };

            const countItems = (rule: any) =>
              (rule.visits || []).reduce((sum: number, v: any) => sum + (v.items?.length || 0), 0);

            // Wait 2s before first fetch — processPdf inserts visits/items
            // AFTER the rule row, so the Realtime event fires too early.
            await new Promise(r => setTimeout(r, 2000));

            let { data: newRule, error } = await fetchRuleWithDetails(payload.new.id);

            if (error || !newRule) {
              console.error('Error fetching new rule via Realtime:', error);
              return;
            }

            // If still 0 items, retry once after 3s (n8n + DB round-trip can be slow)
            if (countItems(newRule) === 0) {
              await new Promise(r => setTimeout(r, 3000));
              const retry = await fetchRuleWithDetails(payload.new.id);
              if (!retry.error && retry.data) {
                newRule = retry.data;
              }
            }

            const ruleWithDetails = {
              ...newRule,
              visits: (newRule.visits || [])
                .sort((a: any, b: any) => a.display_order - b.display_order)
                .map((visit: any) => ({
                  ...visit,
                  items: (visit.items || [])
                    .sort((a: any, b: any) => a.display_order - b.display_order),
                })),
            } as TreatmentRule;

            updateRulesState((prev) => {
              if (prev.some((r) => r.id === ruleWithDetails.id)) return prev;
              return [ruleWithDetails, ...prev];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [telephelyId]);

  // --- Sorting & grouping ---
  const getSortValue = (rule: TreatmentRule): string | number => {
    switch (sortColumn) {
      case 'name': return rule.name;
      case 'category': return rule.category || '';
      case 'visits': return rule.visits?.length || 0;
      case 'items': return countTotalItems(rule);
      case 'created_at': return rule.created_at || '';
      default: return rule.name;
    }
  };

  const compareRules = (a: TreatmentRule, b: TreatmentRule): number => {
    const va = getSortValue(a);
    const vb = getSortValue(b);
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), 'hu');
    }
    return sortDir === 'desc' ? -cmp : cmp;
  };

  // Filter, sort, then group linked pairs together
  const filteredRules = useMemo(() => {
    // 1. Filter
    const filtered = rules.filter(rule => {
      const lowerSearch = searchTerm.toLowerCase();
      const matchesName = rule.name.toLowerCase().includes(lowerSearch);
      const matchesDescription = rule.semantic_description?.toLowerCase().includes(lowerSearch) ?? false;
      const matchesItem = rule.visits?.some(visit =>
        visit.items?.some(item => item.name.toLowerCase().includes(lowerSearch))
      ) || false;
      const matchesSearch = !searchTerm || matchesName || matchesDescription || matchesItem;
      const matchesCategory = categoryFilter === 'all' || rule.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });

    // 2. Sort
    const sorted = [...filtered].sort(compareRules);

    // 3. Group linked pairs: ensure "(SZERKESZTETT)" copy immediately follows its base
    // Build a set of IDs already placed
    const placed = new Set<string>();
    const result: TreatmentRule[] = [];

    for (const rule of sorted) {
      if (placed.has(rule.id!)) continue;
      result.push(rule);
      placed.add(rule.id!);

      // If this rule has a linked counterpart in the filtered list, place it right after
      const linked = findLinkedRule(rule, filtered);
      if (linked && !placed.has(linked.id!)) {
        result.push(linked);
        placed.add(linked.id!);
      }
    }

    return result;
  }, [rules, searchTerm, categoryFilter, sortColumn, sortDir]);

  // Selection derived state (after filteredRules is defined)
  const filteredRuleIds = new Set(filteredRules.map(r => r.id!));
  const visibleSelectedIds = new Set([...selectedIds].filter(id => filteredRuleIds.has(id)));

  const isAllSelected = filteredRules.length > 0 && visibleSelectedIds.size === filteredRules.length;
  const isSomeSelected = visibleSelectedIds.size > 0 && visibleSelectedIds.size < filteredRules.length;

  // Deletable = selected but NOT alapszabaly
  const deletableSelectedIds = useMemo(() => {
    return Array.from(selectedIds).filter(id => {
      const rule = rules.find(r => r.id === id);
      return rule && !rule.alapszabaly;
    });
  }, [selectedIds, rules]);

  // Check if a rule has a linked counterpart in filteredRules
  const linkedMap = useMemo(() => {
    const map = new Map<string, string>(); // ruleId -> linkedRuleId
    for (const rule of filteredRules) {
      const linked = findLinkedRule(rule, filteredRules);
      if (linked) {
        map.set(rule.id!, linked.id!);
      }
    }
    return map;
  }, [filteredRules]);

  const toggleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      const newDir = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(newDir);
      localStorage.setItem('ksz-sort-dir', newDir);
    } else {
      setSortColumn(column);
      setSortDir('asc');
      localStorage.setItem('ksz-sort-col', column);
      localStorage.setItem('ksz-sort-dir', 'asc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 inline" />
      : <ArrowDown className="h-3 w-3 ml-1 inline" />;
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRules.map(r => r.id!)));
    }
  };

  const toggleSelect = (ruleId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  // Open new rule editor
  const handleNewRule = () => {
    setEditingRule(null);
    setOriginalRuleIdToDeactivate(null);
    setEditorOpen(true);
  };

  // Open edit rule editor — for alapszabály, clone into a new "(SZERKESZTETT)" rule
  const handleEditRule = (rule: TreatmentRule) => {
    if (rule.alapszabaly) {
      // Track the original ID so the editor can deactivate it on save
      setOriginalRuleIdToDeactivate(rule.id || null);
      // Clone the rule as a new editable copy
      const clonedRule: TreatmentRule = {
        ...rule,
        id: undefined,
        name: `${rule.name} (SZERKESZTETT)`,
        alapszabaly: false,
        aktiv: true,
        created_at: undefined,
        updated_at: undefined,
        visits: rule.visits?.map(v => ({
          ...v,
          id: undefined,
          rule_id: undefined,
          items: v.items.map(i => ({ ...i, id: undefined, visit_id: undefined })),
        })),
      };
      setEditingRule(clonedRule);
    } else {
      setOriginalRuleIdToDeactivate(null);
      setEditingRule(rule);
    }
    setEditorOpen(true);
  };

  // Open delete confirmation
  const openDeleteConfirm = (ruleId: string, event: React.MouseEvent) => {
    setPendingDeleteId(ruleId);
    setDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setDeleteConfirmOpen(true);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    const idToDelete = pendingDeleteId;
    setDeleteConfirmOpen(false);
    setPendingDeleteId(null);

    // Optimistic: remove from UI immediately
    updateRulesState(prev => prev.filter(r => r.id !== idToDelete));
    toast.success('Szabály sikeresen törölve');

    try {
      const { error } = await supabase
        .from('treatment_rules_stdl')
        .delete()
        .eq('id', idToDelete);

      if (error) throw error;
      notifyRulesDataChanged();
    } catch (err: any) {
      console.error('Error deleting rule:', err);
      toast.error('Hiba a törléskor');
      loadRules(); // Revert on error
    }
  };

  // Open bulk delete confirmation
  const openBulkDeleteConfirm = (event: React.MouseEvent) => {
    setBulkDeleteAnchorPosition({ x: event.clientX, y: event.clientY });
    setBulkDeleteConfirmOpen(true);
  };

  // Handle bulk delete (exclude alapszabaly rules)
  const handleBulkDelete = async () => {
    const deletableIds = Array.from(selectedIds).filter(id => {
      const rule = rules.find(r => r.id === id);
      return rule && !rule.alapszabaly;
    });
    if (deletableIds.length === 0) {
      toast.info('Az alapszabályok nem törölhetők');
      setBulkDeleteConfirmOpen(false);
      return;
    }

    setBulkDeleting(false);
    setBulkDeleteConfirmOpen(false);

    // Optimistic: remove from UI immediately
    const deletableSet = new Set(deletableIds);
    updateRulesState(prev => prev.filter(r => !deletableSet.has(r.id!)));
    setSelectedIds(new Set());
    toast.success(`${deletableIds.length} szabály sikeresen törölve`);

    try {
      const { error } = await supabase
        .from('treatment_rules_stdl')
        .delete()
        .in('id', deletableIds);

      if (error) throw error;
      notifyRulesDataChanged();
    } catch (err: any) {
      console.error('Error bulk deleting rules:', err);
      toast.error('Hiba a törléskor');
      loadRules(); // Revert on error
    }
  };

  // Toggle aktiv status with linked-pair mutual exclusion
  const handleToggleAktiv = async (rule: TreatmentRule) => {
    if (!rule.id) return;

    const newValue = !rule.aktiv;

    // If activating, check for a linked counterpart that's currently active
    if (newValue === true) {
      const linked = findLinkedRule(rule, rules);
      if (linked && linked.aktiv !== false) {
        // Show warning popup
        setPendingToggleRule(rule);
        setPendingToggleLinked(linked);
        setLinkedToggleConfirmOpen(true);
        return;
      }
      
      // 1. Check for unmapped items
      const allItems = rule.visits?.flatMap(v => v.items) || [];
      const hasUnmappedItems = allItems.some(i => !i.item_id);
      
      if (hasUnmappedItems) {
        toast.error("A szabály nem aktiválható, mert olyan tételt tartalmaz, ami nincs szótári elemhez kötve (hiányzó azonosító).");
        return;
      }

      // 2. Check for missing values in the mapped items (name, category, price)
      const itemIds = allItems.map(i => i.item_id).filter(Boolean) as string[];
      if (itemIds.length > 0) {
        try {
          const { data: dbItems, error } = await supabase
            .from('clinic_treatment_items_stdl')
            .select('id, name, category, price, is_active')
            .in('id', itemIds);
            
          if (!error && dbItems) {
            // A) Check for missing values
            const invalidItems = dbItems.filter(i => !i.name || !i.category || i.price === null || i.price === undefined);
            if (invalidItems.length > 0) {
              toast.error("A szabály nem aktiválható, mert hiányos adatú tételeket tartalmaz (pl. hiányzó ár vagy kategória). Kérjük, pótolja a szótárban!");
              return;
            }

            // B) Check for inactive items (existing logic)
            const inactiveItems = dbItems.filter(i => !i.is_active);
            if (inactiveItems.length > 0) {
              setPendingActivationRule(rule);
              setInactiveItemsToActivate(inactiveItems);
              setActivateWarningOpen(true);
              return;
            }
          }
        } catch (err) {
          console.error("Error checking item status:", err);
        }
      }
    }

    // If this rule is part of a multi-selection, toggle all selected
    const idsToToggle = selectedIds.has(rule.id) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [rule.id];

    // Optimistic: update UI immediately
    const toggleSet = new Set(idsToToggle);
    updateRulesState(prev => prev.map(r =>
      toggleSet.has(r.id!) ? { ...r, aktiv: newValue } : r
    ));
    toast.success(
      idsToToggle.length > 1
        ? `${idsToToggle.length} szabály ${newValue ? 'aktiválva' : 'inaktiválva'}`
        : (newValue ? 'Szabály aktiválva' : 'Szabály inaktiválva')
    );

    try {
      const { error } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: newValue })
        .in('id', idsToToggle);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error toggling aktiv:', err);
      toast.error('Hiba a státusz módosításakor');
      loadRules(); // Revert on error
    }
  };

  // Confirm linked toggle: activate the target, deactivate the linked one
  const handleConfirmLinkedToggle = async () => {
    if (!pendingToggleRule?.id || !pendingToggleLinked?.id) return;
    const targetId = pendingToggleRule.id;
    const linkedId = pendingToggleLinked.id;
    setLinkedToggleConfirmOpen(false);
    setPendingToggleRule(null);
    setPendingToggleLinked(null);

    // Optimistic: update UI immediately
    updateRulesState(prev => prev.map(r => {
      if (r.id === targetId) return { ...r, aktiv: true };
      if (r.id === linkedId) return { ...r, aktiv: false };
      return r;
    }));
    toast.success('Szabály aktiválva, a párja inaktiválva');

    try {
      const { error: err1 } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: false })
        .eq('id', linkedId);
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: true })
        .eq('id', targetId);
      if (err2) throw err2;
      notifyRulesDataChanged();
    } catch (err: any) {
      console.error('Error linked toggle:', err);
      toast.error('Hiba a státusz módosításakor');
      loadRules(); // Revert on error
    }
  };

  const handleConfirmActivationWithItems = async () => {
    if (!pendingActivationRule?.id) return;
    
    setActivateWarningOpen(false);
    
    // The items to activate
    const itemIdsToActivate = inactiveItemsToActivate.map(i => i.id);
    const ruleIdsToToggle = selectedIds.has(pendingActivationRule.id) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [pendingActivationRule.id];
      
    // Optimistic update for rules
    const toggleSet = new Set(ruleIdsToToggle);
    updateRulesState(prev => prev.map(r =>
      toggleSet.has(r.id!) ? { ...r, aktiv: true } : r
    ));
    toast.success('Szabály és a kapcsolódó tételek aktiválva');

    try {
      // 1. Activate the items
      if (itemIdsToActivate.length > 0) {
        const { error: itemErr } = await supabase
          .from('clinic_treatment_items_stdl')
          .update({ is_active: true })
          .in('id', itemIdsToActivate);
        if (itemErr) throw itemErr;
        
        // Dispatch global event so KezelesiTetelekTab reloads if needed
        import('@/lib/szotarEvents').then(m => m.notifySzotarDataChanged());
      }
      
      // 2. Activate the rules
      const { error: ruleErr } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: true })
        .in('id', ruleIdsToToggle);
      if (ruleErr) throw ruleErr;
      notifyRulesDataChanged();
    } catch (err: any) {
      console.error('Error activating rule with items:', err);
      toast.error('Hiba az aktiválás során');
      loadRules(); // Revert
    } finally {
      setPendingActivationRule(null);
      setInactiveItemsToActivate([]);
    }
  };

  // Bulk toggle all selected rules
  const handleBulkToggle = async () => {
    if (selectedIds.size === 0) return;
    // Determine target value: if any selected is active, deactivate all; otherwise activate all
    const anyActive = Array.from(selectedIds).some(id => {
      const r = rules.find(rule => rule.id === id);
      return r?.aktiv !== false;
    });
    const newValue = !anyActive;
    const ids = Array.from(selectedIds);

    // Optimistic: update UI immediately
    const idSet = new Set(ids);
    updateRulesState(prev => prev.map(r =>
      idSet.has(r.id!) ? { ...r, aktiv: newValue } : r
    ));
    toast.success(`${selectedIds.size} szabály ${newValue ? 'aktiválva' : 'inaktiválva'}`);

    try {
      const { error } = await supabase
        .from('treatment_rules_stdl')
        .update({ aktiv: newValue })
        .in('id', ids);
      if (error) throw error;
      notifyRulesDataChanged();
    } catch (err: any) {
      console.error('Error bulk toggling:', err);
      toast.error('Hiba a státusz módosításakor');
      loadRules(); // Revert on error
    }
  };

  // PDF Upload handlers - process single PDF and return result for aggregation
  const processSinglePdf = async (file: File): Promise<{ success: boolean; inserted: number; duplicates: number; error?: string }> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const { data, error } = await supabase.functions.invoke('szabalyepito-teszt-webhook', {
        body: {
          file_name: file.name,
          file_content_base64: base64,
          company_id: companyId,
          company_name: companyName,
          telephely_id: telephelyId,
          telephely_name: telephelyName,
          uploaded_by: user?.id,
        },
      });

      if (error) {
        return { success: false, inserted: 0, duplicates: 0, error: error.message || 'Edge function error' };
      }

      if (data?.ok) {
        if (data.status === 'started') {
          return { success: true, inserted: 0, duplicates: 0 };
        }
        if (data.status === 'processed') {
          return { success: true, inserted: data.inserted || 0, duplicates: data.duplicates || 0 };
        }
        return { success: true, inserted: 0, duplicates: 0 };
      } else {
        const errorMessage = data?.message || 'Webhook küldése sikertelen';
        return { success: false, inserted: 0, duplicates: 0, error: errorMessage };
      }
    } catch (err: any) {
      console.error('Error uploading file:', err);
      return { success: false, inserted: 0, duplicates: 0, error: err.message || 'Hiba a fájl feltöltésekor' };
    }
  };

  const handleFilePrepare = async (file: File) => {
    if (!companyId || !telephelyId || !companyName || !telephelyName || !user) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return;
    }

    if (file.type !== 'application/pdf') {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }

    setUploading(true);
    try {
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 30000;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await processSinglePdf(file);

        if (result.success) {
          if (result.inserted > 0) {
            toast.success(`${result.inserted} szabály sikeresen hozzáadva!`);
            addNotification('szabalyok', `${result.inserted} szabály sikeresen hozzáadva`);
            if (result.duplicates > 0) {
              toast.info(`${result.duplicates} duplikált szabály kihagyva`);
            }
          } else {
            toast.success('PDF elküldve feldolgozásra — az új szabályok automatikusan megjelennek');
          }
          setActiveSubTab('list');
          return;
        }

        if (attempt < MAX_RETRIES) {
          toast.warning(`${file.name} hiba (${attempt}/${MAX_RETRIES}), újrapróbálás ${RETRY_DELAY_MS / 1000}mp múlva...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        } else {
          toast.error(`${file.name}: ${result.error || 'Hiba a fájl feltöltésekor'} (${MAX_RETRIES} próba után)`);
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const handleMultipleFiles = async (fileList: FileList) => {
    const pdfFiles = Array.from(fileList).filter(f => f.type === 'application/pdf');

    if (pdfFiles.length === 0) {
      toast.error('Csak PDF fájlok tölthetők fel!');
      return;
    }

    if (pdfFiles.length < fileList.length) {
      toast.warning(`${fileList.length - pdfFiles.length} fájl kihagyva (nem PDF)`);
    }

    if (!companyId || !telephelyId || !companyName || !telephelyName || !user) {
      toast.error('Hiányzó cég vagy telephely azonosító');
      return;
    }

    setUploading(true);
    toast.info(`${pdfFiles.length} PDF feldolgozása...`);

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 30000;

    try {
      let pendingFiles = [...pdfFiles];
      let totalInserted = 0;
      let totalDuplicates = 0;
      let totalSuccessCount = 0;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (pendingFiles.length === 0) break;

        if (attempt > 1) {
          toast.info(`Újrapróbálás: ${pendingFiles.length} PDF (${attempt}/${MAX_RETRIES})...`);
        }

        const results = await Promise.all(
          pendingFiles.map(async (file) => ({
            file,
            result: await processSinglePdf(file),
          }))
        );

        const failedThisRound: File[] = [];

        for (const { file, result } of results) {
          if (result.success) {
            totalSuccessCount++;
            totalInserted += result.inserted;
            totalDuplicates += result.duplicates;
          } else {
            failedThisRound.push(file);
          }
        }

        const successThisRound = results.length - failedThisRound.length;
        if (attempt > 1 && successThisRound > 0) {
          toast.success(`Újrapróbálás: ${successThisRound} PDF sikerült!`);
        }

        pendingFiles = failedThisRound;

        if (pendingFiles.length > 0 && attempt < MAX_RETRIES) {
          toast.warning(`${pendingFiles.length} PDF hiba, újrapróbálás ${RETRY_DELAY_MS / 1000}mp múlva...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }

      if (totalInserted > 0) {
        toast.success(`${totalInserted} szabály sikeresen hozzáadva ${totalSuccessCount} fájlból!`);
        addNotification('szabalyok', `${totalInserted} szabály hozzáadva ${totalSuccessCount} fájlból`);
      }
      if (totalDuplicates > 0) {
        toast.info(`${totalDuplicates} duplikált szabály kihagyva`);
      }
      if (pendingFiles.length > 0) {
        toast.error(`${pendingFiles.length} PDF sikertelen ${MAX_RETRIES} próba után: ${pendingFiles.map(f => f.name).join(', ')}`);
      }
      if (totalSuccessCount > 0 && totalInserted === 0) {
        toast.success(`${totalSuccessCount} PDF elküldve feldolgozásra — az új szabályok automatikusan megjelennek`);
      }

      setActiveSubTab('list');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleMultipleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMultipleFiles(files);
    }
    e.target.value = '';
  };

  const handleGenerateFromDictionary = async () => {
    if (!telephelyId || !user) {
      toast.error('Hiányzó telephely azonosító');
      return;
    }

    const isRegenerate = rules.length > 0;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('szotar-rules-webhook', {
        body: {
          telephely_id: telephelyId,
          user_id: user.id,
          regenerate: isRegenerate,
          mode: 'native',
        },
      });

      if (error) {
        throw new Error(error.message || 'Edge function error');
      }

      if (data?.ok) {
        if (data.status === 'started' && data.batch_id) {
          toast.success(isRegenerate ? 'Szabályok újragenerálása elindult!' : 'Szabályok generálása elindult!');
          setGenerating(false);
          setBackgroundProcessing(true);

          if (isRegenerate) {
            setRules([]);
          }

          let pollCount = 0;
          const maxPolls = 100;

          const pollInterval = setInterval(async () => {
            pollCount++;
            try {
              const { data: jobs } = await supabase
                .from('rule_generation_jobs')
                .select('status')
                .eq('batch_id', data.batch_id);

              if (jobs && jobs.length > 0) {
                const completed = jobs.filter((j: { status: string }) => j.status === 'completed').length;
                const errors = jobs.filter((j: { status: string }) => j.status === 'error').length;
                const total = jobs.length;
                const done = completed + errors;

                if (done >= total) {
                  clearInterval(pollInterval);
                  setBackgroundProcessing(false);
                  if (completed > 0) {
                    toast.success(`Szabályok generálva! ${completed}/${total} sikeres${errors > 0 ? `, ${errors} hibás` : ''}`);
                    notifyRulesDataChanged();
                  } else {
                    toast.error(`Minden protokoll hibás (${errors}/${total})`);
                  }
                  return;
                }
              }
            } catch { /* ignore */ }

            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setBackgroundProcessing(false);
              notifyRulesDataChanged();
              toast.info('Generálás időtúllépés — ellenőrizze az eredményt');
            }
          }, 3000);

          return;

        } else if (data.status === 'processed') {
          toast.success(`${data.inserted || 0} szabály sikeresen hozzáadva!`);
          addNotification('szabalyok', `${data.inserted || 0} szabály hozzáadva szótárból`);
          if (data.duplicates > 0) {
            toast.info(`${data.duplicates} duplikált szabály kihagyva`);
          }
          if (data.errors > 0) {
            toast.warning(`${data.errors} szabály hibás volt`);
          }
          loadRules();
          setActiveSubTab('list');
        } else if (data.status === 'no_extractions') {
          toast.info('Az n8n nem küldött vissza szabályokat');
        } else {
          toast.success('Kérés elküldve feldolgozásra');
        }
      } else {
        const errorMessage = data?.message || 'Webhook hiba';
        if (data?.code === 'N8N_WEBHOOK_NOT_CONFIGURED') {
          toast.error('Az n8n webhook nincs konfigurálva');
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (err: any) {
      console.error('Error generating from dictionary:', err);
      toast.error(err.message || 'Hiba a szabályok generálásakor');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AnimatedCard data-tour="kezelesi-szabalyok">
      <CardHeader data-tour="ksz-header" className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Kezelési Szabályok (Natív)</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">
                  {rules.length} szabály • {telephelyName}
                </p>
                {backgroundProcessing && (
                  <Badge
                    variant="secondary"
                    className="animate-pulse bg-primary/20 text-primary border-primary/30"
                  >
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Feldolgozás...
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div data-tour="ksz-generate" className="flex items-center gap-2">
            <GalaxyButton
              size="icon"
              onClick={loadRules}
              disabled={loading}
              title="Frissítés"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </GalaxyButton>
            <GalaxyButton
              onClick={handleNewRule}
              variant="outline"
              className="bg-background"
            >
              <Plus className="h-4 w-4 mr-2" />
              Új szabály kézzel
            </GalaxyButton>
            <GalaxyButton
              onClick={handleGenerateFromDictionary}
              disabled={generating || backgroundProcessing || loading || szotarLoading || !hasSzotar}
              className="relative min-w-[280px]"
              title={(!hasSzotar && !szotarLoading) ? "A generáláshoz előbb legalább 1 elemet fel kell vennie a Kezelési Tételek közé" : undefined}
            >
              {(generating || backgroundProcessing || loading || szotarLoading) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {(loading || szotarLoading) ? 'Betöltés...' : (generating || backgroundProcessing) ? 'Generálás...' : (rules.length > 0 ? 'Kezelési tételekből újragenerálás' : 'Kezelési tételekből generálás')}
            </GalaxyButton>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sub-tabs for List / Upload */}
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)}>
          <TabsList data-tour="ksz-subtabs" className="grid w-full grid-cols-2 gap-0">
            <TabsTrigger
              value="list"
              className="data-[state=active]:subtab-pulse group rounded-r-none border-r border-border"
              style={activeSubTab === 'list' && !isDark ? { backgroundColor: 'hsl(265 40% 78%)', color: 'hsl(265 50% 20%)' } : undefined}
            >
              <span className="flex items-center gap-2 transition-transform duration-500 group-hover:scale-[1.25]">
                <FileText className="h-4 w-4" />
                Szabályok ({rules.length})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="data-[state=active]:subtab-pulse group rounded-l-none"
              style={activeSubTab === 'upload' && !isDark ? { backgroundColor: 'hsl(265 40% 78%)', color: 'hsl(265 50% 20%)' } : undefined}
            >
              <span className="flex items-center gap-2 transition-transform duration-500 group-hover:scale-[1.25]">
                <FileUp className="h-4 w-4" />
                PDF Feltöltés
              </span>
            </TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="mt-4 space-y-4">
            {/* Filters */}
            <div data-tour="ksz-search" className="flex gap-4">
              <GalaxyButton size="icon" onClick={() => loadRules()} title="Frissítés" className="flex-shrink-0">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </GalaxyButton>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Keresés név vagy trigger szó alapján..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Kategória" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Összes kategória</SelectItem>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleBulkToggle}
                          className="flex items-center gap-2"
                        >
                          <Power className="h-4 w-4" />
                          Ki/Be ({selectedIds.size})
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Kijelöltek aktiválása/inaktiválása</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {(isAdmin || isKlinikaAdmin) && deletableSelectedIds.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={openBulkDeleteConfirm}
                      disabled={bulkDeleting}
                      className="flex items-center gap-2"
                    >
                      {bulkDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Törlés ({deletableSelectedIds.length})
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Rules table */}
            <div data-tour="ksz-table" className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Összes kijelölése"
                        className={cn(isSomeSelected && "data-[state=checked]:bg-primary/50")}
                        {...(isSomeSelected ? { "data-state": "checked" } : {})}
                      />
                    </TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead
                      className="w-[250px] cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort('name')}
                    >
                      Név <SortIcon column="name" />
                    </TableHead>
                    <TableHead
                      className="w-[150px] cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort('category')}
                    >
                      Kategória <SortIcon column="category" />
                    </TableHead>
                    <TableHead className="w-[350px]">Szemantikus leírás</TableHead>
                    <TableHead
                      className="w-[100px] text-center cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort('visits')}
                    >
                      Vizitek <SortIcon column="visits" />
                    </TableHead>
                    <TableHead
                      className="w-[100px] text-center cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort('items')}
                    >
                      Tételek <SortIcon column="items" />
                    </TableHead>
                    <TableHead
                      className="w-[150px] cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort('created_at')}
                    >
                      Létrehozva <SortIcon column="created_at" />
                    </TableHead>
                    <TableHead className="w-[100px] text-right">Műveletek</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32">
                        <div className="flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-32">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <FileText className="h-8 w-8 mb-2 opacity-50" />
                          <p>{searchTerm || categoryFilter !== 'all' ? 'Nincs találat' : 'Még nincsenek szabályok'}</p>
                          {!searchTerm && categoryFilter === 'all' && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="link"
                                onClick={handleNewRule}
                              >
                                Hozza létre kézzel
                              </Button>
                              <span className="text-muted-foreground">vagy</span>
                              <Button
                                variant="link"
                                onClick={() => setActiveSubTab('upload')}
                              >
                                Töltsön fel PDF-et
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRules.map((rule, index) => {
                      const hasLinked = linkedMap.has(rule.id!);
                      const linkedId = linkedMap.get(rule.id!);
                      // Determine if this rule is the "first" of a linked pair (base rule comes first)
                      const isFirstOfPair = hasLinked && (
                        rule.alapszabaly ||
                        (!rule.name.includes('(SZERKESZTETT)') && index < filteredRules.findIndex(r => r.id === linkedId))
                      );
                      // Is this rule the "second" of a linked pair?
                      const isSecondOfPair = hasLinked && !isFirstOfPair;

                      return (
                        <TableRow
                          key={rule.id}
                          className={cn(
                            "animate-fade-in",
                            "hover:bg-muted/30 transition-colors",
                            selectedIds.has(rule.id!) && "bg-primary/10",
                            rule.aktiv === false && "opacity-50",
                            isFirstOfPair && "border-b-0",
                            isSecondOfPair && "border-t-0",
                          )}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(rule.id!)}
                              onCheckedChange={() => toggleSelect(rule.id!)}
                              aria-label={`${rule.name} kijelölése`}
                            />
                          </TableCell>
                          <TableCell>
                            <TooltipProvider>
                              <div className="flex items-center gap-1">
                                {rule.alapszabaly && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Flag className="h-4 w-4 text-purple-500 fill-purple-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>Alapszabály</TooltipContent>
                                  </Tooltip>
                                )}
                                {rule.name.includes('(SZERKESZTETT)') && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Flag className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>Szerkesztett alapszabály</TooltipContent>
                                  </Tooltip>
                                )}
                                {rule.aktiv === false && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Flag className="h-4 w-4 text-muted-foreground fill-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>Inaktív</TooltipContent>
                                  </Tooltip>
                                )}
                                {hasLinked && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Link2 className="h-3.5 w-3.5 text-primary/60" />
                                    </TooltipTrigger>
                                    <TooltipContent>Összekapcsolt szabálypár</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>
                            {rule.category ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary">
                                {rule.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[350px]">
                              {rule.semantic_description ? (
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {rule.semantic_description}
                                </p>
                              ) : (
                                <span className="text-muted-foreground text-xs italic">
                                  Nincs leírás
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {rule.visits?.length || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {countTotalItems(rule)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {rule.created_at ? (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(rule.created_at), 'yyyy.MM.dd', { locale: hu })}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={cn("h-8 w-8", rule.aktiv === false && "text-muted-foreground")}
                                      onClick={() => handleToggleAktiv(rule)}
                                    >
                                      <Power className={cn("h-4 w-4", rule.aktiv !== false && "text-green-500")} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{rule.aktiv !== false ? 'Kikapcsolás' : 'Bekapcsolás'}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEditRule(rule)}
                                title="Szerkesztés"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {(isAdmin || isKlinikaAdmin) && !rule.alapszabaly && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={(e) => openDeleteConfirm(rule.id!, e)}
                                  title="Törlés"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-4">
            <Card
              className={cn(
                "border-2 border-dashed transition-all duration-300 cursor-pointer",
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30",
                uploading && "pointer-events-none opacity-70"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
                <div className={cn(
                  "h-16 w-16 rounded-full flex items-center justify-center transition-all",
                  dragActive
                    ? "bg-primary text-primary-foreground scale-110"
                    : "bg-muted text-muted-foreground"
                )}>
                  {uploading ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <FileUp className="h-8 w-8" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">
                    {uploading ? 'Feldolgozás folyamatban...' : 'Húzza ide a PDF fájlokat'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    vagy kattintson a feltöltéshez (több fájl is kiválasztható)
                  </p>
                </div>
                <div className="flex gap-2">
                  <label>
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={uploading}
                    />
                    <GalaxyButton
                      disabled={uploading}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.parentElement?.querySelector('input');
                        input?.click();
                      }}
                    >
                      <FileUp className="h-4 w-4 mr-2" />
                      PDF kiválasztása
                    </GalaxyButton>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center max-w-md">
                  A feltöltött PDF-eket az n8n automatikusan feldolgozza és a kinyert szabályok
                  közvetlenül megjelennek a Szabályok listában. A kategória és trigger szavak is automatikusan kerülnek hozzáadásra.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Rule Editor Dialog */}
      <TreatmentRuleEditor mode="native"
        open={editorOpen}
        onOpenChange={setEditorOpen}
        clinicId={telephelyId}
        rule={editingRule}
        originalRuleIdToDeactivate={originalRuleIdToDeactivate}
        availableCategories={availableCategories}
        onSave={(savedRule) => {
          if (savedRule) {
            // Optimistic: add or update the rule in local state
            updateRulesState(prev => {
              const exists = prev.some(r => r.id === savedRule.id);
              let next = exists
                ? prev.map(r => r.id === savedRule.id ? savedRule : r)
                : [savedRule, ...prev];
              // If cloning an alapszabály, deactivate the original
              if (originalRuleIdToDeactivate) {
                next = next.map(r =>
                  r.id === originalRuleIdToDeactivate ? { ...r, aktiv: false } : r
                );
              }
              return next;
            });
            notifyRulesDataChanged();
          } else {
            loadRules(); // Fallback
            notifyRulesDataChanged();
          }
          setOriginalRuleIdToDeactivate(null);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Szabály törlése"
        description="Biztosan törölni szeretné ezt a szabályt? Ez a művelet nem visszavonható."
        confirmText="Törlés"
        cancelText="Mégse"
        onConfirm={handleDelete}
        variant="danger"
        anchorPosition={deleteAnchorPosition}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onOpenChange={setBulkDeleteConfirmOpen}
        title={`${deletableSelectedIds.length} szabály törlése`}
        description={`Biztosan törölni szeretné a kijelölt ${deletableSelectedIds.length} szabályt? Ez a művelet nem visszavonható.`}
        confirmText={`Törlés (${deletableSelectedIds.length})`}
        cancelText="Mégse"
        onConfirm={handleBulkDelete}
        variant="danger"
        anchorPosition={bulkDeleteAnchorPosition}
      />

      {/* Linked pair toggle warning */}
      <ConfirmDialog
        open={linkedToggleConfirmOpen}
        onOpenChange={setLinkedToggleConfirmOpen}
        title="Összekapcsolt szabály"
        description={`A "${pendingToggleLinked?.name || ''}" jelenleg aktív. Ha ezt a szabályt aktiválja, a párja automatikusan inaktiválódik.`}
        confirmText="Aktiválás"
        cancelText="Mégse"
        onConfirm={handleConfirmLinkedToggle}
        variant="warning"
      />
      {/* Activate Rule with Inactive Items Confirmation */}
      <ConfirmDialog
        open={activateWarningOpen}
        onOpenChange={setActivateWarningOpen}
        title="Inaktív tételek aktiválása"
        description={
          <div className="space-y-2">
            <p>
              A kiválasztott kezelési szabály bekapcsolásához a benne szereplő inaktív kezelési tételeket is aktiválni kell.
            </p>
            <p className="font-semibold text-sm mt-2 text-foreground">Érintett tételek:</p>
            <ul className="list-disc pl-5 text-sm">
              {inactiveItemsToActivate.map(item => (
                <li key={item.id}>{item.name}</li>
              ))}
            </ul>
            <p className="mt-4">Biztosan folytatja?</p>
          </div>
        }
        confirmText="Aktiválás"
        cancelText="Mégse"
        onConfirm={handleConfirmActivationWithItems}
        variant="warning"
      />
    </AnimatedCard>
  );
}
