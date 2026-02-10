import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
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
  Sparkles,
  Flag,
  Power,
  Link2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GalaxyButton } from './GalaxyButton';
import { AnimatedCard } from './AnimatedCard';
import { TreatmentRuleEditor } from './TreatmentRuleEditor';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { TreatmentRule, RuleVisit, RuleItem, CATEGORY_OPTIONS } from '@/types/treatmentRules';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCachedRoles } from '@/hooks/useCachedRoles';

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

export function KezelesiSzabalyokTab({ 
  companyId, 
  telephelyId, 
  companyName, 
  telephelyName 
}: KezelesiSzabalyokTabProps) {
  const { user } = useAuth();
  const { isAdmin } = useCachedRoles();
  const [rules, setRules] = useState<TreatmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'upload'>('list');
  
  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TreatmentRule | null>(null);
  
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

  // Upload state
  const [uploading, setUploading] = useState(false);
  
  // Generate from dictionary state
  const [generating, setGenerating] = useState(false);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Count total items across all visits
  const countTotalItems = (rule: TreatmentRule): number => {
    return rule.visits?.reduce((sum, visit) => sum + (visit.items?.length || 0), 0) || 0;
  };

  // Load rules with visits and items
  const loadRules = useCallback(async () => {
    if (!telephelyId) return;
    
    setLoading(true);
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('treatment_rules')
        .select('*')
        .eq('clinic_id', telephelyId)
        .order('created_at', { ascending: false });

      if (rulesError) throw rulesError;

      const rulesWithDetails: TreatmentRule[] = [];
      
      for (const rule of rulesData || []) {
        const { data: visitsData, error: visitsError } = await supabase
          .from('rule_visits')
          .select('*')
          .eq('rule_id', rule.id)
          .order('display_order');

        if (visitsError) throw visitsError;

        const visitsWithItems: RuleVisit[] = [];
        
        for (const visit of visitsData || []) {
          const { data: itemsData, error: itemsError } = await supabase
            .from('rule_items')
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

      setRules(rulesWithDetails);
    } catch (err: any) {
      console.error('Error loading rules:', err);
      toast.error('Hiba a szabályok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [telephelyId]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

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
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDir('asc');
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
    setEditorOpen(true);
  };

  // Open edit rule editor — for alapszabály, clone into a new "(SZERKESZTETT)" rule
  const handleEditRule = (rule: TreatmentRule) => {
    if (rule.alapszabaly) {
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
    
    try {
      const { error } = await supabase
        .from('treatment_rules')
        .delete()
        .eq('id', pendingDeleteId);

      if (error) throw error;

      toast.success('Szabály sikeresen törölve');
      loadRules();
    } catch (err: any) {
      console.error('Error deleting rule:', err);
      toast.error('Hiba a törléskor');
    } finally {
      setDeleteConfirmOpen(false);
      setPendingDeleteId(null);
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
    
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('treatment_rules')
        .delete()
        .in('id', deletableIds);

      if (error) throw error;

      toast.success(`${deletableIds.length} szabály sikeresen törölve`);
      setSelectedIds(new Set());
      loadRules();
    } catch (err: any) {
      console.error('Error bulk deleting rules:', err);
      toast.error('Hiba a törléskor');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirmOpen(false);
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
    }

    // If this rule is part of a multi-selection, toggle all selected
    const idsToToggle = selectedIds.has(rule.id) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [rule.id];
    
    try {
      const { error } = await supabase
        .from('treatment_rules')
        .update({ aktiv: newValue })
        .in('id', idsToToggle);
      if (error) throw error;
      toast.success(
        idsToToggle.length > 1
          ? `${idsToToggle.length} szabály ${newValue ? 'aktiválva' : 'inaktiválva'}`
          : (newValue ? 'Szabály aktiválva' : 'Szabály inaktiválva')
      );
      loadRules();
    } catch (err: any) {
      console.error('Error toggling aktiv:', err);
      toast.error('Hiba a státusz módosításakor');
    }
  };

  // Confirm linked toggle: activate the target, deactivate the linked one
  const handleConfirmLinkedToggle = async () => {
    if (!pendingToggleRule?.id || !pendingToggleLinked?.id) return;
    try {
      // Deactivate the linked rule
      const { error: err1 } = await supabase
        .from('treatment_rules')
        .update({ aktiv: false })
        .eq('id', pendingToggleLinked.id);
      if (err1) throw err1;

      // Activate the target rule
      const { error: err2 } = await supabase
        .from('treatment_rules')
        .update({ aktiv: true })
        .eq('id', pendingToggleRule.id);
      if (err2) throw err2;

      toast.success('Szabály aktiválva, a párja inaktiválva');
      loadRules();
    } catch (err: any) {
      console.error('Error linked toggle:', err);
      toast.error('Hiba a státusz módosításakor');
    } finally {
      setLinkedToggleConfirmOpen(false);
      setPendingToggleRule(null);
      setPendingToggleLinked(null);
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
    try {
      const { error } = await supabase
        .from('treatment_rules')
        .update({ aktiv: newValue })
        .in('id', Array.from(selectedIds));
      if (error) throw error;
      toast.success(`${selectedIds.size} szabály ${newValue ? 'aktiválva' : 'inaktiválva'}`);
      loadRules();
    } catch (err: any) {
      console.error('Error bulk toggling:', err);
      toast.error('Hiba a státusz módosításakor');
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
        if (data.status === 'processed') {
          return { success: true, inserted: data.inserted || 0, duplicates: data.duplicates || 0 };
        } else {
          return { success: true, inserted: 0, duplicates: 0 };
        }
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
      const result = await processSinglePdf(file);
      
      if (result.success) {
        if (result.inserted > 0) {
          toast.success(`${result.inserted} szabály sikeresen hozzáadva!`);
          if (result.duplicates > 0) {
            toast.info(`${result.duplicates} duplikált szabály kihagyva`);
          }
          loadRules();
          setActiveSubTab('list');
        } else {
          toast.success('PDF elküldve feldolgozásra');
          setTimeout(() => loadRules(), 5000);
        }
      } else {
        toast.error(result.error || 'Hiba a fájl feltöltésekor');
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
    
    try {
      const results = await Promise.all(pdfFiles.map(file => processSinglePdf(file)));
      
      const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
      const totalDuplicates = results.reduce((sum, r) => sum + r.duplicates, 0);
      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;
      
      if (totalInserted > 0) {
        toast.success(`${totalInserted} szabály sikeresen hozzáadva ${successCount} fájlból!`);
      }
      if (totalDuplicates > 0) {
        toast.info(`${totalDuplicates} duplikált szabály kihagyva`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} fájl feldolgozása sikertelen`);
      }
      if (successCount > 0 && totalInserted === 0) {
        toast.success(`${successCount} PDF elküldve feldolgozásra`);
      }
      
      loadRules();
      setActiveSubTab('list');
      setTimeout(() => loadRules(), 5000);
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

    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('szotar-rules-webhook', {
        body: {
          telephely_id: telephelyId,
          user_id: user.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Edge function error');
      }

      if (data?.ok) {
        if (data.status === 'started') {
          toast.success('Szabályok generálása elindult! A háttérben fut...');
          setGenerating(false);
          setBackgroundProcessing(true);
          
          const initialRuleCount = rules.length;
          let pollCount = 0;
          const maxPolls = 40;
          
          const pollInterval = setInterval(async () => {
            pollCount++;
            await loadRules();
            
            const currentRuleCount = rules.length;
            if (currentRuleCount > initialRuleCount) {
              clearInterval(pollInterval);
              setBackgroundProcessing(false);
              toast.success(`Új szabályok érkeztek! (${currentRuleCount - initialRuleCount} új)`);
            }
            
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setBackgroundProcessing(false);
              toast.info('Szabályok frissítve');
            }
          }, 3000);
          
          return;
          
        } else if (data.status === 'processed') {
          toast.success(`${data.inserted || 0} szabály sikeresen hozzáadva!`);
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
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle>Kezelési Szabályok</CardTitle>
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
          
          <div className="flex items-center gap-2">
            <GalaxyButton 
              onClick={handleGenerateFromDictionary}
              disabled={generating}
              className="relative"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {generating ? 'Generálás...' : 'Generálás szótárból'}
            </GalaxyButton>
            <Button
              variant="outline"
              size="icon"
              onClick={loadRules}
              disabled={loading}
              title="Frissítés"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <GalaxyButton onClick={handleNewRule}>
              <Plus className="h-4 w-4 mr-2" />
              Új szabály
            </GalaxyButton>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Sub-tabs for List / Upload */}
        <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Szabályok ({rules.length})
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <FileUp className="h-4 w-4" />
              PDF Feltöltés
            </TabsTrigger>
          </TabsList>

          {/* List Tab */}
          <TabsContent value="list" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex gap-4">
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
                  {CATEGORY_OPTIONS.map((cat) => (
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
                  {isAdmin && deletableSelectedIds.length > 0 && (
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
            <div className="border rounded-lg overflow-hidden">
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
                                      title={rule.aktiv ? 'Kikapcsolás' : 'Bekapcsolás'}
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
                              {isAdmin && !rule.alapszabaly && (
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
      <TreatmentRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        clinicId={telephelyId}
        rule={editingRule}
        onSave={loadRules}
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
    </AnimatedCard>
  );
}
